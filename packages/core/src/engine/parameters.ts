import type { ParameterDef, ParameterOption } from '@reports-web/shared';
import type { DataQuery } from '../adapters/data/types.js';
import type { ReportSchemaV1 } from '../schema/report-schema.js';

/** Parameter values supplied by the host, keyed by `ParameterDef.name`. */
export type ParameterValues = Readonly<Record<string, unknown>>;

/**
 * Normalized value of a `dateRange` parameter. Each end is a local `YYYY-MM-DD` for Date/epoch inputs (other date
 * strings as given). Both ends are present for required parameters; an OPTIONAL dateRange may be open-ended, in which
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

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date of `d` as `YYYY-MM-DD` (no time, no zone), e.g. local 2026-10-01 00:00 -> `2026-10-01` in any TZ. */
function toLocalDateString(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Serializes a `date` parameter (and each end of a `dateRange`):
 * - `Date` object or epoch milliseconds -> the LOCAL calendar date `YYYY-MM-DD` (never `toISOString()`, which would
 *   shift e.g. local 2026-10-01 00:00 in UTC+3 to 2026-09-30T21:00Z).
 * - `YYYY-MM-DD` string -> unchanged.
 * - Any other string `Date.parse` accepts (e.g. a full ISO timestamp) -> kept as-is (trimmed); the host owns its zone.
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
    const s = v.trim();
    if (ISO_DATE_ONLY.test(s)) {
      if (Number.isNaN(Date.parse(s))) throw new InvalidValue('expected a valid date');
      return s;
    }
    if (!Number.isNaN(Date.parse(s))) return s;
  }
  throw new InvalidValue('expected a YYYY-MM-DD string, Date or epoch milliseconds');
}

/** `datetime`: Date / epoch ms -> full ISO via `toISOString()` (UTC instant); other parseable strings kept as-is. */
function coerceDateTime(v: unknown): string {
  if (v instanceof Date || (typeof v === 'number' && Number.isFinite(v))) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new InvalidValue('expected a valid date-time');
    return d.toISOString();
  }
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v.trim()))) return v.trim();
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
 * (number, bool, date -> local `YYYY-MM-DD` for Date/epoch ms, datetime -> ISO via toISOString(), dateRange -> `{ from, to }` local dates (optional ranges may be open-ended), select -> matching option value).
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
