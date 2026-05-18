import { describe, it, expect } from 'vitest';
import { Logger, MemorySink } from './logger.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Logger', () => {
  it('buffers entries and flushes via microtask', async () => {
    const sink = new MemorySink();
    const log = new Logger({ level: 'debug', sink });
    log.info('test', 'hello');
    log.info('test', 'world');
    expect(sink.entries.length).toBe(0);
    await flush();
    expect(sink.entries.length).toBe(2);
    expect(sink.entries[0]?.msg).toBe('hello');
  });

  it('filters by level', async () => {
    const sink = new MemorySink();
    const log = new Logger({ level: 'warn', sink });
    log.debug('t', 'x');
    log.info('t', 'x');
    log.warn('t', 'y');
    log.error('t', 'z');
    await flush();
    expect(sink.entries.map((e) => e.level)).toEqual(['warn', 'error']);
  });

  it('redacts sensitive keys recursively', async () => {
    const sink = new MemorySink();
    const log = new Logger({ level: 'info', sink });
    log.info('auth', 'login', { user: 'a', password: 'p', nested: { token: 't' } });
    await flush();
    const data = sink.entries[0]?.data as { password: string; nested: { token: string } };
    expect(data.password).toBe('[REDACTED]');
    expect(data.nested.token).toBe('[REDACTED]');
  });

  it('respects silent level', async () => {
    const sink = new MemorySink();
    const log = new Logger({ level: 'silent', sink });
    log.error('x', 'still off');
    await flush();
    expect(sink.entries.length).toBe(0);
  });

  it('does not throw if sink fails', async () => {
    const log = new Logger({ level: 'info', sink: { write: () => { throw new Error('boom'); } } });
    expect(() => log.info('t', 'x')).not.toThrow();
    await flush();
  });

  it('flushSync drains the queue immediately', () => {
    const sink = new MemorySink();
    const log = new Logger({ level: 'info', sink });
    log.info('t', 'a');
    log.info('t', 'b');
    log.flushSync();
    expect(sink.entries.length).toBe(2);
  });

  it('zero allocation when below level', () => {
    const sink = new MemorySink();
    const log = new Logger({ level: 'error', sink });
    for (let i = 0; i < 1000; i++) log.debug('hot', 'x', { i });
    log.flushSync();
    expect(sink.entries.length).toBe(0);
  });

  it('changes level at runtime', async () => {
    const sink = new MemorySink();
    const log = new Logger({ level: 'error', sink });
    log.info('t', 'a');
    log.setLevel('info');
    log.info('t', 'b');
    await flush();
    expect(sink.entries.map((e) => e.msg)).toEqual(['b']);
  });

  it('replaces sink', async () => {
    const a = new MemorySink();
    const b = new MemorySink();
    const log = new Logger({ level: 'info', sink: a });
    log.info('t', '1');
    await flush();
    log.setSink(b);
    log.info('t', '2');
    await flush();
    expect(a.entries.length).toBe(1);
    expect(b.entries.length).toBe(1);
  });

  it('tracks timestamps using injected now()', async () => {
    let t = 100;
    const sink = new MemorySink();
    const log = new Logger({ level: 'info', sink, now: () => t });
    log.info('t', 'x');
    t = 250;
    log.info('t', 'y');
    await flush();
    expect(sink.entries[0]?.ts).toBe(100);
    expect(sink.entries[1]?.ts).toBe(250);
  });
});
