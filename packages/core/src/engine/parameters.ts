import type { ParameterDef, ParameterOption } from '@reports-web/shared';
import type { DataQuery } from '../adapters/data/types.js';
import type { ReportSchemaV1 } from '../schema/report-schema.js';

/** Parameter values supplied by the host, keyed by `ParameterDef.name`. */
export type ParameterValues = Readonly<Record<string, unknown>>;

/**
 * Normalized value of a `dateRange` parameter. Each end is a local calendar date `YYYY-MM-DD` (from a Date, epoch ms,
 * a `YYYY-MM-DD` string or an ISO 8601 date-time string). Both ends are present for required parameters; an OPTIONAL dateRange may be open-ended, in which
 * case only the provided end is set (`{ from }` or `{ to }`).
 */
export interface DateRangeValue {
  from?: string;
  to?: string;
}

export interface ParameterIssue {
  readonly name: string;
  readonly code: 'required' | 'invalid';
  readonly message: string;
}

export type ResolveParametersResult =
  | { readonly ok: true; readonly values: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issues: readonly ParameterIssue[]; readonly error: string };

/** Thrown by `buildDataQuery` when parameter values are missing or invalid. */
export class ParameterValidationError extends Error {
  readonly issues: readonly ParameterIssue[];
  constructor(issues: readonly ParameterIssue[]) {
    super(formatIssues(issues));
    this.name = 'ParameterValidationError';
    this.issues = issues;
  }
}

function formatIssues(issues: readonly ParameterIssue[]): string {
  return `Invalid report parameters: ${issues.map((i) => `${i.name}: ${i.message}`).join('; ')}`;
}

const MISSING = Symbol('missing');
type Coerced = unknown | typeof MISSING;

class InvalidValue extends Error {}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * ISO 8601 date-time (extended format): `YYYY-MM-DDTHH:mm`, optional `:ss` and `.fraction`, then `Z`, `±HH:mm`,
 * `±HHmm`, `±HH` or nothing (local time). The `T` separator is required (case-insensitive).
 */
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Local calendar date of `d` as `YYYY-MM-DD` (no time, no zone), e.g. local 2026-10-01 00:00 -> `2026-10-01` in any TZ. */
function toLocalDateString(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True when year/month/day form a real calendar date (round-trip through Date.UTC: rejects 2026-02-30, 2026-13-01). */
function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(2000, m - 1, d));
  t.setUTCFullYear(y);
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

interface ParsedDateString {
  /** `YYYY-MM-DD` as written in the string. */
  ymd: string;
  /** Epoch ms of the instant when the string carries a zone (`Z` / offset); undefined for date-only or local times. */
  instant?: number;
}

/**
 * Parses a strict `YYYY-MM-DD` or ISO 8601 date-time string, validating every component (month 1-12, day within the
 * month, hour 0-23, minute/second 0-59, offset up to ±23:59). Returns undefined for anything else.
 */
function parseIsoDateString(s: string): ParsedDateString | undefined {
  const d = ISO_DATE_ONLY.exec(s);
  if (d) return isValidYmd(+d[1]!, +d[2]!, +d[3]!) ? { ymd: s } : undefined;
  const m = ISO_DATE_TIME.exec(s);
  if (!m) return undefined;
  const [, ys, mos, ds, hs, mis, ss, frac, zone] = m;
  const y = +ys!, mo = +mos!, day = +ds!, h = +hs!, mi = +mis!, sec = ss ? +ss : 0;
  if (!isValidYmd(y, mo, day) || h > 23 || mi > 59 || sec > 59) return undefined;
  const ymd = `${ys}-${mos}-${ds}`;
  if (!zone) return { ymd };
  let offsetMin = 0;
  if (zone.toUpperCase() !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    const oh = +digits.slice(0, 2);
    const om = digits.length > 2 ? +digits.slice(2) : 0;
    if (oh > 23 || om > 59) return undefined;
    offsetMin = (zone[0] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  const ms = frac ? Math.floor(+`0.${frac}` * 1000) : 0;
  const utc = new Date(Date.UTC(2000, mo - 1, day, h, mi, sec, ms));
  utc.setUTCFullYear(y);
  return { ymd, instant: utc.getTime() - offsetMin * 60_000 };
}

/**
 * Serializes a `date` parameter (and each end of a `dateRange`) to the LOCAL calendar date `YYYY-MM-DD`:
 * - `Date` object or epoch milliseconds -> local calendar date (never `toISOString()`, which would shift e.g. local
 *   2026-10-01 00:00 in UTC+3 to 2026-09-30T21:00Z).
 * - Strict `YYYY-MM-DD` string with a real calendar date -> unchanged (2026-02-30, 2026-04-31, 2026-13-01 rejected).
 * - ISO 8601 date-time string (`T` + time): with `Z` / an offset it is converted to the local calendar date of that
 *   instant; without a zone it is local time, so its own date part is used. Components are validated.
 * - Anything else ("1", "hello 5", "10/01/2026", ...) -> invalid.
 */
function coerceDate(v: unknown): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new InvalidValue('expected a valid date');
    return toLocalDateString(v);
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new InvalidValue('expected a valid date');
    return toLocalDateString(d);
  }
  if (typeof v === 'string') {
    const p = parseIsoDateString(v.trim());
    if (p) return p.instant === undefined ? p.ymd : toLocalDateString(new Date(p.instant));
    throw new InvalidValue('expected a valid YYYY-MM-DD or ISO 8601 date-time string');
  }
  throw new InvalidValue('expected a YYYY-MM-DD string, Date or epoch milliseconds');
}

/**
 * `datetime`: Date / epoch ms -> full ISO via `toISOString()` (UTC instant). Strings must be an ISO 8601 date-time
 * or a `YYYY-MM-DD` date with valid components and are sent as given (trimmed); anything else is invalid.
 */
function coerceDateTime(v: unknown): string {
  if (v instanceof Date || (typeof v === 'number' && Number.isFinite(v))) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new InvalidValue('expected a valid date-time');
    return d.toISOString();
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (parseIsoDateString(s)) return s;
    throw new InvalidValue('expected a valid ISO 8601 date-time string');
  }
  throw new InvalidValue('expected an ISO date-time string, Date or epoch milliseconds');
}

function coerceDateRange(def: ParameterDef, v: unknown): DateRangeValue | typeof MISSING {
  let from: unknown;
  let to: unknown;
  if (Array.isArray(v) && v.length === 2) [from, to] = v;
  else if (v && typeof v === 'object' && !(v instanceof Date)) ({ from, to } = v as { from?: unknown; to?: unknown });
  else throw new InvalidValue('expected { from, to }');
  const hasFrom = !isBlank(from);
  const hasTo = !isBlank(to);
  if ((!hasFrom || !hasTo) && def.required) throw new InvalidValue('dateRange requires both from and to');
  if (!hasFrom && !hasTo) return MISSING; // optional range with neither end: omitted like any absent optional value
  const r: DateRangeValue = {};
  if (hasFrom) r.from = coerceDate(from);
  if (hasTo) r.to = coerceDate(to);
  if (r.from !== undefined && r.to !== undefined && Date.parse(r.from) > Date.parse(r.to)) {
    throw new InvalidValue('from must not be after to');
  }
  return r;
}

function coerceSelect(def: ParameterDef, v: unknown): unknown {
  if (!Array.isArray(def.options)) return v; // dynamic {source,...} options: cannot validate client-side
  const options = def.options as readonly ParameterOption[];
  const exact = options.find((o) => Object.is(o.value, v));
  if (exact) return exact.value;
  // tolerate string form of a non-string option value (e.g. "2" from a <select> for value 2)
  const loose = options.find((o) => String(o.value) === String(v));
  if (loose && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) return loose.value;
  throw new InvalidValue('value is not one of the allowed options');
}

function coerce(def: ParameterDef, v: unknown): Coerced {
  if (isBlank(v)) return MISSING;
  switch (def.type) {
    case 'string':
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
      throw new InvalidValue('expected a string');
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
      if (!Number.isFinite(n)) throw new InvalidValue('expected a number');
      return n;
    }
    case 'bool':
      if (typeof v === 'boolean') return v;
      if (v === 1 || v === 'true' || v === '1') return true;
      if (v === 0 || v === 'false' || v === '0') return false;
      throw new InvalidValue('expected a boolean');
    case 'date':
      return coerceDate(v);
    case 'datetime':
      return coerceDateTime(v);
    case 'dateRange':
      return coerceDateRange(def, v);
    case 'select':
      return coerceSelect(def, v);
    default:
      return v;
  }
}

/**
 * Resolves effective parameter values: explicit value (blank = absent) ?? `ParameterDef.default`, coerced to the declared type
 * (number, bool, date -> local `YYYY-MM-DD` (Date, epoch ms, strict YYYY-MM-DD or ISO 8601 date-time; anything else invalid), datetime -> ISO via toISOString() or a validated ISO string, dateRange -> `{ from, to }` local dates (optional ranges may be open-ended), select -> matching option value).
 * Required parameters without a value produce a `required` issue. Optional parameters without a value are omitted.
 * Values for names that are not declared are passed through unchanged.
 */
export function resolveParameterValues(
  defs: readonly ParameterDef[] | undefined,
  values?: ParameterValues | null,
): ResolveParametersResult {
  const out: Record<string, unknown> = {};
  const issues: ParameterIssue[] = [];
  const declared = new Set<string>();
  for (const def of defs ?? []) {
    declared.add(def.name);
    const explicit = values?.[def.name];
    const raw = isBlank(explicit) ? def.default : explicit;
    try {
      const v = coerce(def, raw);
      if (v === MISSING) {
        if (def.required) issues.push({ name: def.name, code: 'required', message: 'value is required' });
      } else {
        out[def.name] = v;
      }
    } catch (e) {
      if (!(e instanceof InvalidValue)) throw e;
      issues.push({ name: def.name, code: 'invalid', message: e.message });
    }
  }
  for (const [k, v] of Object.entries(values ?? {})) {
    if (!declared.has(k) && v !== undefined) out[k] = v;
  }
  if (issues.length) return { ok: false, issues, error: formatIssues(issues) };
  return { ok: true, values: out };
}

/**
 * Builds the `DataQuery` for a report: `dataset.params` (static) merged with resolved parameter values
 * (declared defaults and explicit values win over static params). Throws `ParameterValidationError`.
 */
export function buildDataQuery(
  schema: Pick<ReportSchemaV1, 'dataset'> & Partial<Pick<ReportSchemaV1, 'parameters'>>,
  values?: ParameterValues | null,
): DataQuery {
  const resolved = resolveParameterValues(schema.parameters, values);
  if (!resolved.ok) throw new ParameterValidationError(resolved.issues);
  return { source: schema.dataset.source, params: { ...(schema.dataset.params ?? {}), ...resolved.values } };
}

function canonical(v: unknown): unknown {
  if (v instanceof Date) return { $date: v.getTime() };
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => [k, canonical((v as Record<string, unknown>)[k])]);
  }
  return v;
}

/** Structural equality for parameter value objects (used to avoid refetching on identical values). */
export function parameterValuesEqual(a: ParameterValues | null | undefined, b: ParameterValues | null | undefined): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
  } catch {
    return false;
  }
}
