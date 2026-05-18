export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface LogEntry {
  readonly ts: number;
  readonly level: Exclude<LogLevel, 'silent'>;
  readonly tag: string;
  readonly msg: string;
  readonly data?: unknown;
}

export interface LogSink {
  write(batch: readonly LogEntry[]): void;
}

const REDACT_KEYS = new Set(['password', 'token', 'authorization', 'secret', 'apikey', 'api_key', 'cookie']);

function redact(input: unknown, depth = 0): unknown {
  if (depth > 4 || input == null) return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return input;
}

export class ConsoleSink implements LogSink {
  write(batch: readonly LogEntry[]): void {
    for (const e of batch) {
      const line = `[${e.level.toUpperCase()}][${e.tag}] ${e.msg}`;
      const fn = e.level === 'error' ? console.error : e.level === 'warn' ? console.warn : e.level === 'debug' ? console.debug : console.info;
      if (e.data !== undefined) fn(line, e.data);
      else fn(line);
    }
  }
}

export class MemorySink implements LogSink {
  readonly entries: LogEntry[] = [];
  write(batch: readonly LogEntry[]): void {
    for (const e of batch) this.entries.push(e);
  }
  clear(): void {
    this.entries.length = 0;
  }
}

export class Logger {
  private queue: LogEntry[] = [];
  private scheduled = false;
  private minLevel: LogLevel;
  private sink: LogSink;
  private now: () => number;

  constructor(opts: { level?: LogLevel; sink?: LogSink; now?: () => number } = {}) {
    this.minLevel = opts.level ?? 'info';
    this.sink = opts.sink ?? new ConsoleSink();
    this.now = opts.now ?? (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now());
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  setSink(sink: LogSink): void {
    this.sink = sink;
  }

  debug(tag: string, msg: string, data?: unknown): void {
    this.enqueue('debug', tag, msg, data);
  }
  info(tag: string, msg: string, data?: unknown): void {
    this.enqueue('info', tag, msg, data);
  }
  warn(tag: string, msg: string, data?: unknown): void {
    this.enqueue('warn', tag, msg, data);
  }
  error(tag: string, msg: string, data?: unknown): void {
    this.enqueue('error', tag, msg, data);
  }

  flushSync(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    this.scheduled = false;
    try {
      this.sink.write(batch);
    } catch {
      // sink must never crash the application
    }
  }

  private enqueue(level: Exclude<LogLevel, 'silent'>, tag: string, msg: string, data?: unknown): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;
    this.queue.push({ ts: this.now(), level, tag, msg, data: data === undefined ? undefined : redact(data) });
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flushSync());
  }
}

export const logger = new Logger({ level: typeof process !== 'undefined' && process.env?.NODE_ENV === 'production' ? 'warn' : 'info' });
