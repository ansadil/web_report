import type { LocaleTag, LocalizedText, ParameterDef, ParameterOption, ParameterOptionsSource, ParameterType, Row } from '@reports-web/shared';
import { formatNumber, isArabicLocale, uiLanguage } from '@reports-web/shared';
import type { DataAdapter, DataQuery } from '../adapters/data/types.js';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { resolveLabel } from './dictionary.js';
import {
  isRelativeDatePreset,
  isRelativeDateRangePreset,
  resolveRelativeDate,
  resolveRelativeDateRange,
  type WeekStart,
} from './relative-dates.js';
import { resolveTimeZone, ymdInTimeZone, zonedParts, zonedTimeToInstant } from './time-zone.js';

/** Parameter values supplied by the host, keyed by `ParameterDef.name`. */
export type ParameterValues = Readonly<Record<string, unknown>>;

/**
 * Normalized value of a `dateRange` parameter. Each end is a calendar date `YYYY-MM-DD` in the configured time zone (from a Date, epoch ms,
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

/**
 * Which rule an issue broke (finer than `ParameterIssue.code`, which stays `'required' | 'invalid'`):
 * `required` (no value), `type` (cannot be coerced to the declared type), `option` (not an allowed select option),
 * `incomplete` (required dateRange with one end), `range` (dateRange from > to), `min` / `max` (out of bounds),
 * `bounds` (a definition error: the resolved `min` is after / greater than the resolved `max`, e.g. `min: 'today'`
 * with `max: 'startOfMonth'`, so no value can be valid).
 */
export type ParameterRule = 'required' | 'type' | 'option' | 'incomplete' | 'range' | 'min' | 'max' | 'bounds';

/** Options for resolving / validating parameter values. */
export interface ResolveParametersOptions {
  /** Reference instant for relative defaults and bounds (`today`, `thisMonth`, `now`, ...). Default: current time. */
  readonly now?: Date | number;
  /** First day of the week for week presets; default 0 (Sunday). */
  readonly weekStartsOn?: WeekStart;
  /**
   * IANA time zone (default `'Asia/Riyadh'`, never the runtime's zone) used for relative presets (`today`,
   * `thisMonth`, ...), for the calendar date of `Date` / epoch-ms / zoned ISO values given to `date` and `dateRange`
   * parameters, for zone-less `datetime` bounds, and for formatting date-time bounds in messages.
   */
  readonly timeZone?: string;
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

class InvalidValue extends Error {
  constructor(
    message: string,
    readonly rule: Exclude<ParameterRule, 'required'> = 'type',
    readonly args: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * ISO 8601 date-time (extended format): `YYYY-MM-DDTHH:mm`, optional `:ss` and `.fraction`, then `Z`, `±HH:mm`,
 * `±HHmm`, `±HH` or nothing (wall time in the configured time zone). The `T` separator is required (case-insensitive).
 */
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Effective time zone of the options (validated; default Asia/Riyadh). */
function tzOf(opts?: ResolveParametersOptions): string {
  return resolveTimeZone(opts?.timeZone);
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
  /** Epoch ms of the instant when the string carries a zone (`Z` / offset); undefined for date-only or zone-less times. */
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
 * Serializes a `date` parameter (and each end of a `dateRange`) to the calendar date `YYYY-MM-DD` in the configured
 * time zone (`options.timeZone`, default Asia/Riyadh; the runtime's zone is never used):
 * - `Date` object or epoch milliseconds -> calendar date of that instant in the time zone (never `toISOString()`,
 *   which would shift e.g. 2026-10-01 00:00 Riyadh to 2026-09-30T21:00Z).
 * - Strict `YYYY-MM-DD` string with a real calendar date -> unchanged (2026-02-30, 2026-04-31, 2026-13-01 rejected).
 * - ISO 8601 date-time string (`T` + time): with `Z` / an offset it is converted to the calendar date of that
 *   instant in the time zone; without a zone it is wall time, so its own date part is used. Components are validated.
 * - Anything else ("1", "hello 5", "10/01/2026", ...) -> invalid.
 */
function coerceDate(v: unknown, tz: string): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new InvalidValue('expected a valid date');
    return ymdInTimeZone(v.getTime(), tz);
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new InvalidValue('expected a valid date');
    return ymdInTimeZone(d.getTime(), tz);
  }
  if (typeof v === 'string') {
    const p = parseIsoDateString(v.trim());
    if (p) return p.instant === undefined ? p.ymd : ymdInTimeZone(p.instant, tz);
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

function coerceDateRange(def: ParameterDef, v: unknown, tz: string): DateRangeValue | typeof MISSING {
  let from: unknown;
  let to: unknown;
  if (Array.isArray(v) && v.length === 2) [from, to] = v;
  else if (v && typeof v === 'object' && !(v instanceof Date)) ({ from, to } = v as { from?: unknown; to?: unknown });
  else throw new InvalidValue('expected { from, to }');
  const hasFrom = !isBlank(from);
  const hasTo = !isBlank(to);
  if ((!hasFrom || !hasTo) && def.required) throw new InvalidValue('dateRange requires both from and to', 'incomplete');
  if (!hasFrom && !hasTo) return MISSING; // optional range with neither end: omitted like any absent optional value
  const r: DateRangeValue = {};
  if (hasFrom) r.from = coerceDate(from, tz);
  if (hasTo) r.to = coerceDate(to, tz);
  if (r.from !== undefined && r.to !== undefined && Date.parse(r.from) > Date.parse(r.to)) {
    throw new InvalidValue('from must not be after to', 'range');
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
  throw new InvalidValue('value is not one of the allowed options', 'option');
}

function coerce(def: ParameterDef, v: unknown, tz: string): Coerced {
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
      return coerceDate(v, tz);
    case 'datetime':
      return coerceDateTime(v);
    case 'dateRange':
      return coerceDateRange(def, v, tz);
    case 'select':
      return coerceSelect(def, v);
    default:
      return v;
  }
}

/** Replaces relative presets in a `default` (`thisMonth`, `{ from: 'startOfMonth', to: 'today' }`, `'now'`) by concrete values. */
function resolveDefault(def: ParameterDef, v: unknown, opts?: ResolveParametersOptions): unknown {
  switch (def.type) {
    case 'date':
      return isRelativeDatePreset(v) ? resolveRelativeDate(v, opts) : v;
    case 'datetime':
      return v === 'now' ? nowDate(opts).toISOString() : v;
    case 'dateRange': {
      if (isRelativeDateRangePreset(v)) return resolveRelativeDateRange(v, opts);
      const end = (e: unknown) => (isRelativeDatePreset(e) ? resolveRelativeDate(e, opts) : e);
      if (Array.isArray(v) && v.length === 2) return [end(v[0]), end(v[1])];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const r = v as { from?: unknown; to?: unknown };
        return { from: end(r.from), to: end(r.to) };
      }
      return v;
    }
    default:
      return v;
  }
}

function nowDate(opts?: ResolveParametersOptions): Date {
  return opts?.now === undefined ? new Date() : new Date(opts.now);
}

/** Concrete `min` / `max` for a parameter (presets resolved), or undefined when absent / not applicable. */
function resolveBound(def: ParameterDef, b: number | string | undefined, opts?: ResolveParametersOptions): number | string | undefined {
  if (b === undefined) return undefined;
  switch (def.type) {
    case 'number':
      return typeof b === 'number' && Number.isFinite(b) ? b : undefined;
    case 'date':
    case 'dateRange':
      if (isRelativeDatePreset(b)) return resolveRelativeDate(b, opts);
      return typeof b === 'string' && ISO_DATE_ONLY.test(b) ? b : undefined;
    case 'datetime':
      if (b === 'now') return nowDate(opts).toISOString();
      return typeof b === 'string' && parseIsoDateString(b) ? b : undefined;
    default:
      return undefined;
  }
}

/** Epoch ms of a validated ISO date / date-time string (date-only and zone-less values are wall time in `tz`). */
function instantOf(s: string, tz: string): number {
  const p = parseIsoDateString(s)!;
  if (p.instant !== undefined) return p.instant;
  const m = ISO_DATE_TIME.exec(s);
  const [y, mo, d] = p.ymd.split('-').map(Number) as [number, number, number];
  return zonedTimeToInstant(tz, y, mo, d, m ? +m[4]! : 0, m ? +m[5]! : 0, m?.[6] ? +m[6] : 0, m?.[7] ? Math.floor(+`0.${m[7]}` * 1000) : 0);
}

/**
 * Definition-time check: an `InvalidValue` (rule `bounds`) when the resolved `min` is after / greater than the resolved
 * `max` (relative presets resolved against `now` in the time zone), else undefined.
 */
function boundsConflict(def: ParameterDef, opts?: ResolveParametersOptions): InvalidValue | undefined {
  const min = resolveBound(def, def.min, opts);
  const max = resolveBound(def, def.max, opts);
  if (min === undefined || max === undefined) return undefined;
  let bad: boolean;
  if (def.type === 'number') bad = (min as number) > (max as number);
  else if (def.type === 'datetime') bad = instantOf(min as string, tzOf(opts)) > instantOf(max as string, tzOf(opts));
  else bad = (min as string) > (max as string);
  return bad ? new InvalidValue(`invalid parameter definition: min ${min} is after max ${max}`, 'bounds', { min, max }) : undefined;
}

function checkBounds(def: ParameterDef, v: unknown, opts?: ResolveParametersOptions): void {
  const min = resolveBound(def, def.min, opts);
  const max = resolveBound(def, def.max, opts);
  if (min === undefined && max === undefined) return;
  if (def.type === 'number') {
    const n = v as number;
    if (min !== undefined && n < (min as number)) throw new InvalidValue(`must be at least ${min}`, 'min', { min });
    if (max !== undefined && n > (max as number)) throw new InvalidValue(`must be at most ${max}`, 'max', { max });
    return;
  }
  if (def.type === 'datetime') {
    const tz = tzOf(opts);
    const t = instantOf(v as string, tz);
    if (min !== undefined && t < instantOf(min as string, tz)) throw new InvalidValue(`must not be before ${min}`, 'min', { min });
    if (max !== undefined && t > instantOf(max as string, tz)) throw new InvalidValue(`must not be after ${max}`, 'max', { max });
    return;
  }
  const ends = def.type === 'dateRange' ? [(v as DateRangeValue).from, (v as DateRangeValue).to] : [v as string];
  for (const e of ends) {
    if (e === undefined) continue;
    if (min !== undefined && e < (min as string)) throw new InvalidValue(`must not be before ${min}`, 'min', { min });
    if (max !== undefined && e > (max as string)) throw new InvalidValue(`must not be after ${max}`, 'max', { max });
  }
}

/** An issue with the rule it broke and the values its message refers to (e.g. `{ min }`). */
export interface ParameterIssueDetail extends ParameterIssue {
  readonly rule: ParameterRule;
  readonly args: Readonly<Record<string, unknown>>;
}

interface DetailedResolution {
  readonly values: Record<string, unknown>;
  readonly issues: ParameterIssueDetail[];
}

function resolveDetailed(
  defs: readonly ParameterDef[] | undefined,
  values: ParameterValues | null | undefined,
  opts: ResolveParametersOptions | undefined,
): DetailedResolution {
  const out: Record<string, unknown> = {};
  const issues: ParameterIssueDetail[] = [];
  const declared = new Set<string>();
  const tz = tzOf(opts);
  for (const def of defs ?? []) {
    declared.add(def.name);
    const explicit = values?.[def.name];
    const raw = isBlank(explicit) ? resolveDefault(def, def.default, opts) : explicit;
    try {
      const conflict = boundsConflict(def, opts);
      const v = coerce(def, raw, tz);
      if (v === MISSING) {
        if (conflict && def.required) throw conflict;
        if (def.required) issues.push({ name: def.name, code: 'required', message: 'value is required', rule: 'required', args: {} });
      } else {
        if (conflict) throw conflict;
        checkBounds(def, v, opts);
        out[def.name] = v;
      }
    } catch (e) {
      if (!(e instanceof InvalidValue)) throw e;
      issues.push({ name: def.name, code: 'invalid', message: e.message, rule: e.rule, args: e.args });
    }
  }
  for (const [k, v] of Object.entries(values ?? {})) {
    if (!declared.has(k) && v !== undefined) out[k] = v;
  }
  return { values: out, issues };
}

/**
 * Resolves effective parameter values: explicit value (blank = absent) ?? `ParameterDef.default` (relative presets such
 * as `thisMonth` / `today` / `now` resolved against `options.now` in `options.timeZone`, default Asia/Riyadh), coerced to the declared type
 * (number, bool, date -> `YYYY-MM-DD` in the time zone (Date, epoch ms, strict YYYY-MM-DD or ISO 8601 date-time; anything else invalid), datetime -> ISO via toISOString() or a validated ISO string, dateRange -> `{ from, to }` dates in the time zone (optional ranges may be open-ended), select -> matching option value)
 * and checked against `min` / `max`.
 * Required parameters without a value produce a `required` issue. Optional parameters without a value are omitted.
 * Values for names that are not declared are passed through unchanged.
 * These are exactly the values `buildDataQuery` hands to data adapters (`DataQuery.params`).
 */
export function resolveParameterValues(
  defs: readonly ParameterDef[] | undefined,
  values?: ParameterValues | null,
  options?: ResolveParametersOptions,
): ResolveParametersResult {
  const r = resolveDetailed(defs, values, options);
  if (r.issues.length) {
    const issues = r.issues.map(({ name, code, message }) => ({ name, code, message }));
    return { ok: false, issues, error: formatIssues(issues) };
  }
  return { ok: true, values: r.values };
}

/**
 * Builds the `DataQuery` for a report: `dataset.params` (static) merged with resolved parameter values
 * (declared defaults and explicit values win over static params). Throws `ParameterValidationError`.
 */
export function buildDataQuery(
  schema: Pick<ReportSchemaV1, 'dataset'> & Partial<Pick<ReportSchemaV1, 'parameters'>>,
  values?: ParameterValues | null,
  options?: ResolveParametersOptions,
): DataQuery {
  const resolved = resolveParameterValues(schema.parameters, values, options);
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

// ---------------------------------------------------------------------------------------------------------------
// Parameters panel API: normalized definitions, localized validation, option loading.
// ---------------------------------------------------------------------------------------------------------------

/** Anything that carries parameter definitions: a `ReportSchemaV1`, `{ parameters, meta }`, or a plain `ParameterDef[]`. */
export type ParametersSource =
  | readonly ParameterDef[]
  | { readonly parameters?: readonly ParameterDef[]; readonly meta?: { readonly locale?: string } };

export interface ParameterPanelOptions extends ResolveParametersOptions {
  /** UI / message locale (`ar`, `ar-SA`, `en`, ...). Default: `report.meta.locale`, else `en`. */
  readonly locale?: LocaleTag;
  /**
   * Input format shown in the "invalid date" message of `date` parameters, matching how the host's date field is
   * displayed (BUG-68). Default `'YYYY-MM-DD'`. Use {@link dateFormatHintFor} for the report locale's field format,
   * e.g. `يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م` for Arabic.
   */
  readonly dateFormatHint?: string;
}

/** Default `dateFormatHint`: the canonical ISO calendar date. */
export const DEFAULT_DATE_FORMAT_HINT = 'YYYY-MM-DD';

/**
 * `dateFormatHint` matching the viewer's date field for `locale`: `يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م` for Arabic (`ar`,
 * `ar-*`), `YYYY-MM-DD` otherwise.
 */
export function dateFormatHintFor(locale: LocaleTag = 'en'): string {
  // BUG-76: accept POSIX-style tags such as `ar_SA`.
  return uiLanguage(String(locale).replace(/_/g, '-')) === 'ar' ? 'يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م' : DEFAULT_DATE_FORMAT_HINT;
}

export interface ParameterOptionItem {
  readonly value: unknown;
  /** Label resolved for the requested locale. */
  readonly label: string;
}

/** A `ParameterDef` normalized for rendering one field of a parameters panel. */
export interface ParameterDefinition {
  readonly name: string;
  readonly type: ParameterType;
  /** Label for the locale (falls back to `en`, any label, then `name`). */
  readonly label: string;
  /** Description for the locale, when the template has one. */
  readonly description?: string;
  readonly required: boolean;
  /**
   * The default, resolved (relative presets applied against `now`) and coerced like an input value, e.g.
   * `{ from: '2026-10-01', to: '2026-10-31' }` for `default: 'thisMonth'`. Undefined when there is no usable default.
   */
  readonly defaultValue?: unknown;
  /** The relative preset the default came from (`'thisMonth'`, `'today'`, `'now'`, ...), if any. */
  readonly defaultPreset?: string;
  /** Bounds with presets resolved (`number` for number params, `YYYY-MM-DD` for date/dateRange, ISO for datetime). */
  readonly min?: number | string;
  readonly max?: number | string;
  /**
   * Localized definition error, e.g. when the resolved `min` is after the resolved `max` (`min: 'today'`,
   * `max: 'startOfMonth'`): no value can satisfy the field. Absent when the definition is usable.
   */
  readonly definitionError?: string;
  /** Static select options with labels for the locale. */
  readonly options?: readonly ParameterOptionItem[];
  /** Dynamic select options: load them with `loadParameterOptions`. */
  readonly optionsSource?: ParameterOptionsSource;
  /** The original definition from the template. */
  readonly def: ParameterDef;
}

function sourceDefs(report: ParametersSource | null | undefined): readonly ParameterDef[] {
  if (!report) return [];
  if (Array.isArray(report)) return report as readonly ParameterDef[];
  return (report as { parameters?: readonly ParameterDef[] }).parameters ?? [];
}

function sourceLocale(report: ParametersSource | null | undefined, opts?: ParameterPanelOptions): string {
  if (opts?.locale) return opts.locale;
  if (report && !Array.isArray(report)) {
    const l = (report as { meta?: { locale?: string } }).meta?.locale;
    if (l) return l;
  }
  return 'en';
}

/** Label of a parameter for `locale` (`label` -> `name`); `ar-SA` falls back to `ar` labels. */
export function parameterLabel(def: Pick<ParameterDef, 'name' | 'label'>, locale: LocaleTag = 'en'): string {
  return localized(def.label, locale, def.name);
}

function localized(text: LocalizedText | undefined, locale: string, fallback: string): string {
  if (text && typeof text === 'object' && !text[locale]) {
    const lang = uiLanguage(locale);
    if (text[lang]) return text[lang]!;
  }
  return resolveLabel(text, locale, fallback);
}

function presetOf(def: ParameterDef): string | undefined {
  const d = def.default;
  if (def.type === 'date' && isRelativeDatePreset(d)) return d;
  if (def.type === 'dateRange' && isRelativeDateRangePreset(d)) return d;
  if (def.type === 'datetime' && d === 'now') return d;
  return undefined;
}

/**
 * Normalized parameter definitions of a report, in template order, ready for a parameters panel: localized label and
 * description, `required` as a boolean, the default resolved (relative presets applied) and coerced, resolved
 * `min` / `max`, and localized static options (or the `optionsSource` to load). Old templates without parameters -> `[]`.
 */
export function getParameterDefinitions(report: ParametersSource | null | undefined, options?: ParameterPanelOptions): ParameterDefinition[] {
  const locale = sourceLocale(report, options);
  return sourceDefs(report).map((def) => {
    let defaultValue: unknown;
    if (!isBlank(def.default)) {
      const r = resolveDetailed([{ ...def, required: false }], null, options);
      if (r.issues.length === 0) defaultValue = r.values[def.name];
    }
    const min = resolveBound(def, def.min, options);
    const max = resolveBound(def, def.max, options);
    const conflict = boundsConflict(def, options);
    const definitionError = conflict ? formatParameterIssue(conflict, def, locale, options) : undefined;
    const preset = presetOf(def);
    const description = def.description !== undefined ? localized(def.description, locale, '') : '';
    return {
      name: def.name,
      type: def.type,
      label: parameterLabel(def, locale),
      ...(description ? { description } : {}),
      required: def.required === true,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(preset ? { defaultPreset: preset } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(definitionError ? { definitionError } : {}),
      ...(Array.isArray(def.options)
        ? { options: (def.options as readonly ParameterOption[]).map((o) => ({ value: o.value, label: localized(o.label, locale, String(o.value)) })) }
        : {}),
      ...(def.options && !Array.isArray(def.options) ? { optionsSource: def.options as ParameterOptionsSource } : {}),
      def,
    };
  });
}

/** One field error of `validateParameterValues`, with a message in the requested locale. */
export interface ParameterFieldError extends ParameterIssueDetail {
  /** Localized label of the parameter. */
  readonly label: string;
}

export interface ParameterValidationResult {
  readonly ok: boolean;
  /**
   * Resolved values (defaults applied, coerced) for every parameter that is valid, plus undeclared values passed
   * through. When `ok` these are exactly the values sent to the data adapter.
   */
  readonly values: Readonly<Record<string, unknown>>;
  /** Errors in template order (at most one per parameter). */
  readonly errors: readonly ParameterFieldError[];
  /** `name -> localized message`, for showing each error next to its field. */
  readonly fieldErrors: Readonly<Record<string, string>>;
}

type Lang = 'ar' | 'en';
type MessageFn = (a: { label: string; type: ParameterType; min?: string; max?: string; hint: string }) => string;

const DATE_TYPES: ReadonlySet<ParameterType> = new Set(['date', 'datetime', 'dateRange']);

const MESSAGES: Record<Lang, Record<ParameterRule, MessageFn>> = {
  en: {
    required: ({ label }) => `${label} is required`,
    type: ({ type, hint }) =>
      ({
        number: 'Enter a valid number',
        date: `Enter a valid date (${hint})`,
        datetime: 'Enter a valid date and time',
        dateRange: 'Enter a valid date range',
        bool: 'Choose yes or no',
        string: 'Enter a text value',
        select: 'Choose one of the available options',
      })[type],
    option: () => 'Choose one of the available options',
    incomplete: () => 'Enter both the start and the end date',
    range: () => 'The start date must not be after the end date',
    min: ({ type, min }) => (DATE_TYPES.has(type) ? `Must not be before ${min}` : `Must be at least ${min}`),
    max: ({ type, max }) => (DATE_TYPES.has(type) ? `Must not be after ${max}` : `Must be at most ${max}`),
    bounds: ({ type, min, max }) =>
      DATE_TYPES.has(type)
        ? `Invalid parameter settings: the minimum date ${min} is after the maximum date ${max}`
        : `Invalid parameter settings: the minimum ${min} is greater than the maximum ${max}`,
  },
  ar: {
    required: ({ label }) => `يجب إدخال ${label}`,
    type: ({ type, hint }) =>
      ({
        number: 'أدخل رقمًا صالحًا',
        date: `أدخل تاريخًا صالحًا (${hint})`,
        datetime: 'أدخل تاريخًا ووقتًا صالحين',
        dateRange: 'أدخل فترة صالحة',
        bool: 'اختر نعم أو لا',
        string: 'أدخل قيمة نصية',
        select: 'اختر إحدى القيم المتاحة',
      })[type],
    option: () => 'اختر إحدى القيم المتاحة',
    incomplete: () => 'أدخل تاريخ البداية وتاريخ النهاية',
    range: () => 'يجب ألا يكون تاريخ البداية بعد تاريخ النهاية',
    min: ({ type, min }) => (DATE_TYPES.has(type) ? `يجب ألا يكون التاريخ قبل ${min}` : `يجب ألا تقل القيمة عن ${min}`),
    max: ({ type, max }) => (DATE_TYPES.has(type) ? `يجب ألا يكون التاريخ بعد ${max}` : `يجب ألا تزيد القيمة عن ${max}`),
    bounds: ({ type, min, max }) =>
      DATE_TYPES.has(type)
        ? `إعدادات المعامل غير صالحة: الحد الأدنى للتاريخ ${min} بعد الحد الأقصى ${max}`
        : `إعدادات المعامل غير صالحة: الحد الأدنى ${min} أكبر من الحد الأقصى ${max}`,
  },
};

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
/** FIRST STRONG ISOLATE / POP DIRECTIONAL ISOLATE: keep a date's `-` `/` `:` from being reordered inside RTL text. */
const FSI = '\u2068';
const PDI = '\u2069';
/** LEFT-TO-RIGHT ISOLATE: keeps `YYYY-MM-DD HH:mm` in reading order inside an RTL bound. */
const LRI = '\u2066';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Offset of `tz` from UTC at the instant `ms` as `GMT+3` / `GMT-4` / `GMT+5:30` (`GMT+0` for UTC); computed from the
 * zoned wall clock, so it is DST-correct for the instant and does not depend on ICU zone-name data.
 */
function gmtOffsetLabel(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  const whole = Math.floor(ms / 1000) * 1000;
  const wall = new Date(Date.UTC(2000, p.month - 1, p.day, p.hour, p.minute, p.second));
  wall.setUTCFullYear(p.year, p.month - 1, p.day);
  const minutes = Math.round((wall.getTime() - whole) / 60_000);
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${minutes < 0 ? '-' : '+'}${h}${m ? `:${pad2(m)}` : ''}`;
}

/**
 * Date-time bound for messages (BUG-60): `YYYY-MM-DD HH:mm` (`:ss` only when non-zero, 24-hour, Gregorian) as the wall
 * clock in `tz`, followed by the zone: its UTC offset at that instant and the IANA id, e.g.
 * `2026-11-01 01:30 GMT+3 (Asia/Riyadh)`. ISO-like order is unambiguous in English (no US `11/01/2026`) and matches the
 * `YYYY-MM-DD` date bounds and the `datetime` input format. Arabic uses the same order with Arabic-Indic digits and
 * `غرينتش` for GMT, e.g. `٢٠٢٦-١١-٠١ ٠١:٣٠ غرينتش+٣ (Asia/Riyadh)`; the date-time is wrapped in LRI ... PDI so it is
 * not reordered in RTL, and the Latin IANA id in FSI ... PDI.
 */
function formatDateTimeBound(ms: number, locale: string, tz: string): string {
  const p = zonedParts(ms, tz);
  const year = p.year < 0 ? `-${String(-p.year).padStart(4, '0')}` : String(p.year).padStart(4, '0');
  let text = `${year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
  if (ms % 60_000 !== 0) text += `:${pad2(p.second)}`;
  const offset = gmtOffsetLabel(ms, tz);
  if (!isArabicLocale(locale)) return `${text} ${offset} (${tz})`;
  const digits = (t: string) => t.replace(/[0-9]/g, (d) => ARABIC_INDIC[+d]!);
  return `${LRI}${digits(text)}${PDI} ${digits(offset.replace('GMT', 'غرينتش'))} (${FSI}${tz}${PDI})`;
}

/**
 * Bound for a message: numbers via `formatNumber` (Arabic-Indic digits for `ar*`); `date` / `dateRange` bounds as
 * `YYYY-MM-DD` with localized digits; `datetime` bounds as `YYYY-MM-DD HH:mm` in the time zone plus the zone label
 * (see `formatDateTimeBound`; never a raw UTC ISO string). In Arabic messages date bounds are wrapped in FSI ... PDI so
 * they are not scrambled in RTL text.
 */
function formatBound(v: unknown, locale: string, type: ParameterType, tz: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return formatNumber(v, locale);
  const s = String(v);
  const ar = isArabicLocale(locale);
  const isolate = (t: string) => (ar ? `${FSI}${t}${PDI}` : t);
  if (type === 'datetime' && parseIsoDateString(s)) return isolate(formatDateTimeBound(instantOf(s, tz), locale, tz));
  const text = ar ? s.replace(/[0-9]/g, (d) => ARABIC_INDIC[+d]!) : s;
  return DATE_TYPES.has(type) ? isolate(text) : text;
}

/**
 * Localized (ar / en; `ar-*` -> Arabic, anything else -> English) message for an issue, e.g. `يجب إدخال الفرع` /
 * `Branch is required`. Numbers in the message follow the locale's digits (Arabic-Indic for Arabic); date bounds are
 * bidi-isolated, and date-time bounds are shown as a local date and time in `options.timeZone` (default Asia/Riyadh).
 */
export function formatParameterIssue(
  issue: Pick<ParameterIssueDetail, 'rule'> & Partial<Pick<ParameterIssueDetail, 'args'>>,
  def: Pick<ParameterDef, 'name' | 'label' | 'type'>,
  locale: LocaleTag = 'en',
  options?: Pick<ParameterPanelOptions, 'timeZone' | 'dateFormatHint'>,
): string {
  const lang: Lang = uiLanguage(locale);
  const args = issue.args ?? {};
  const tz = tzOf(options);
  const rawHint = options?.dateFormatHint?.trim() || DEFAULT_DATE_FORMAT_HINT;
  return MESSAGES[lang][issue.rule]({
    // A host hint is bidi-isolated in every language (BUG-75: an Arabic hint inside an English message) so `/` and
    // digits keep their order; the default text is unchanged.
    hint: rawHint !== DEFAULT_DATE_FORMAT_HINT ? `${FSI}${rawHint}${PDI}` : rawHint,
    label: parameterLabel(def, locale),
    type: def.type,
    min: formatBound(args.min, locale, def.type, tz),
    max: formatBound(args.max, locale, def.type, tz),
  });
}

/**
 * Validates host / panel values against the report's parameters exactly like the data fetch does (same coercion,
 * defaults, relative presets, `required`, select options, dateRange from <= to, `min` / `max`) and returns per-field
 * errors with messages in `options.locale` (default `report.meta.locale`). Never throws for invalid values.
 */
export function validateParameterValues(
  report: ParametersSource | null | undefined,
  values?: ParameterValues | null,
  options?: ParameterPanelOptions,
): ParameterValidationResult {
  const defs = sourceDefs(report);
  const locale = sourceLocale(report, options);
  const r = resolveDetailed(defs, values, options);
  const byName = new Map(defs.map((d) => [d.name, d]));
  const errors: ParameterFieldError[] = r.issues.map((i) => {
    const def = byName.get(i.name)!;
    return { ...i, label: parameterLabel(def, locale), message: formatParameterIssue(i, def, locale, options) };
  });
  const fieldErrors: Record<string, string> = {};
  for (const e of errors) fieldErrors[e.name] = e.message;
  return { ok: errors.length === 0, values: r.values, errors, fieldErrors };
}

export interface LoadParameterOptionsOptions {
  readonly locale?: LocaleTag;
  readonly signal?: AbortSignal;
  /** Extra params for the options query (e.g. a tenant id); sent as `DataQuery.params`. */
  readonly params?: Readonly<Record<string, unknown>>;
}

function readPath(row: Row, path: string): unknown {
  if (path in row) return row[path];
  let cur: unknown = row;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * Options of a `select` parameter for the panel. Static options are returned with localized labels; for
 * `options: { source, valueField, labelField }` the rows of `source` are fetched through `adapter`
 * (`adapter.fetch({ source, params })`) and mapped to `{ value: row[valueField], label: row[labelField] }`
 * (dotted paths allowed; `LocalizedText` labels resolved; rows without a value and duplicate values skipped).
 */
export async function loadParameterOptions(
  def: Pick<ParameterDef, 'name' | 'options'>,
  adapter: DataAdapter | null | undefined,
  options?: LoadParameterOptionsOptions,
): Promise<ParameterOptionItem[]> {
  const locale = options?.locale ?? 'en';
  if (!def.options) return [];
  if (Array.isArray(def.options)) {
    return (def.options as readonly ParameterOption[]).map((o) => ({ value: o.value, label: localized(o.label, locale, String(o.value)) }));
  }
  const src = def.options as ParameterOptionsSource;
  if (!adapter) throw new Error(`parameter "${def.name}": options source "${src.source}" needs a data adapter`);
  const rows = await adapter.fetch({ source: src.source, ...(options?.params ? { params: options.params } : {}) }, options?.signal);
  const seen = new Set<string>();
  const out: ParameterOptionItem[] = [];
  for (const row of rows) {
    const value = readPath(row, src.valueField);
    if (value === undefined || value === null) continue;
    const key = typeof value === 'object' ? JSON.stringify(value) : `${typeof value}:${String(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = readPath(row, src.labelField);
    const label =
      raw && typeof raw === 'object' ? localized(raw as LocalizedText, locale, String(value)) : raw == null || raw === '' ? String(value) : String(raw);
    out.push({ value, label });
  }
  return out;
}
