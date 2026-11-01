/**
 * IANA time-zone helpers built on `Intl.DateTimeFormat` (no runtime-TZ dependence): calendar parts of an instant in a
 * zone, and the instant of a wall-clock time in a zone. Gregorian calendar only.
 */

/** Time zone used for relative date presets and date coercion when the host does not supply one. */
export const DEFAULT_TIME_ZONE = 'Asia/Riyadh';

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        calendar: 'gregory',
        numberingSystem: 'latn',
        hourCycle: 'h23',
        era: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      throw new RangeError(`invalid time zone "${timeZone}" (expected an IANA name such as "Asia/Riyadh")`);
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/**
 * Validates an IANA time-zone name and returns it; `undefined` / empty -> {@link DEFAULT_TIME_ZONE}.
 * Throws a `RangeError` for unknown zones.
 */
export function resolveTimeZone(timeZone?: string | null): string {
  const tz = timeZone?.trim() || DEFAULT_TIME_ZONE;
  partsFormatter(tz);
  return tz;
}

/** True when `timeZone` is a time zone `Intl` knows. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    partsFormatter(timeZone.trim());
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  readonly year: number;
  /** 1-12 */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** Gregorian wall-clock parts of the instant `ms` in `timeZone`. */
export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormatter(timeZone).formatToParts(ms)) p[type] = value;
  const y = +p.year!;
  return {
    year: p.era === 'BC' || p.era === 'B' ? 1 - y : y,
    month: +p.month!,
    day: +p.day!,
    hour: +p.hour! % 24,
    minute: +p.minute!,
    second: +p.second!,
  };
}

/** Epoch ms of a UTC wall time (years 0-99 kept as written). */
function utcMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number {
  const t = new Date(Date.UTC(2000, mo - 1, d, h, mi, s, ms));
  t.setUTCFullYear(y, mo - 1, d);
  return t.getTime();
}

/** Offset of `timeZone` from UTC at the instant `ms`, in ms (Riyadh: +3h). */
function offsetAt(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const whole = Math.floor(ms / 1000) * 1000;
  return utcMs(p.year, p.month, p.day, p.hour, p.minute, p.second) - whole;
}

/** Epoch ms of the wall-clock time `y-mo-d h:mi:s.ms` in `timeZone` (month 1-12). */
export function zonedTimeToInstant(
  timeZone: string,
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
  ms = 0,
): number {
  const wall = utcMs(y, mo, d, h, mi, s, ms);
  const o1 = offsetAt(wall, timeZone);
  let t = wall - o1;
  const o2 = offsetAt(t, timeZone);
  if (o2 !== o1) t = wall - o2;
  return t;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** `YYYY-MM-DD` from Gregorian parts (month 1-12). */
export function formatYmd(y: number, mo: number, d: number): string {
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
}

/** Calendar date (`YYYY-MM-DD`) of the instant `ms` in `timeZone`. */
export function ymdInTimeZone(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return formatYmd(p.year, p.month, p.day);
}
