import type { LocalizedText, RelativeDatePreset, RelativeDateRangePreset } from '@reports-web/shared';
import { formatYmd, resolveTimeZone, zonedParts } from './time-zone.js';

/** Day the week starts on: 0 = Sunday (default, as in Saudi Arabia) ... 6 = Saturday. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RelativeDateOptions {
  /** Reference instant ("now"); default `new Date()`. Its calendar day is taken in {@link RelativeDateOptions.timeZone}. */
  readonly now?: Date | number;
  /**
   * IANA time zone that decides which calendar day "now" falls on (e.g. `'Asia/Riyadh'`, `'UTC'`,
   * `'America/New_York'`); default `'Asia/Riyadh'`, never the runtime's zone. Pass
   * `Intl.DateTimeFormat().resolvedOptions().timeZone` for the browser's zone. Presets use the Gregorian calendar only.
   */
  readonly timeZone?: string;
  /** First day of the week for `startOfWeek` / `thisWeek` / `lastWeek`; default 0 (Sunday). */
  readonly weekStartsOn?: WeekStart;
}

/**
 * Relative date presets. All presets (weeks, months, quarters, years) follow the Gregorian calendar only; Hijri
 * (Umm al-Qura) months and years are not supported (undecided), even when the report locale is `ar-SA`.
 */
export const RELATIVE_DATE_PRESETS: readonly RelativeDatePreset[] = Object.freeze([
  'today', 'yesterday', 'tomorrow', 'startOfWeek', 'endOfWeek', 'startOfMonth', 'endOfMonth',
  'startOfQuarter', 'endOfQuarter', 'startOfYear', 'endOfYear',
] as const);

export const RELATIVE_DATE_RANGE_PRESETS: readonly RelativeDateRangePreset[] = Object.freeze([
  'today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter',
  'thisYear', 'lastYear', 'last7Days', 'last30Days', 'monthToDate', 'yearToDate',
] as const);

/** Display labels (ar / en) for the range presets, e.g. for quick-pick buttons in a parameters panel. */
export const RELATIVE_DATE_RANGE_LABELS: Readonly<Record<RelativeDateRangePreset, LocalizedText>> = Object.freeze({
  today: { ar: 'اليوم', en: 'Today' },
  yesterday: { ar: 'أمس', en: 'Yesterday' },
  thisWeek: { ar: 'هذا الأسبوع', en: 'This week' },
  lastWeek: { ar: 'الأسبوع الماضي', en: 'Last week' },
  thisMonth: { ar: 'هذا الشهر', en: 'This month' },
  lastMonth: { ar: 'الشهر الماضي', en: 'Last month' },
  thisQuarter: { ar: 'هذا الربع', en: 'This quarter' },
  lastQuarter: { ar: 'الربع الماضي', en: 'Last quarter' },
  thisYear: { ar: 'هذه السنة', en: 'This year' },
  lastYear: { ar: 'السنة الماضية', en: 'Last year' },
  last7Days: { ar: 'آخر ٧ أيام', en: 'Last 7 days' },
  last30Days: { ar: 'آخر ٣٠ يومًا', en: 'Last 30 days' },
  monthToDate: { ar: 'من بداية الشهر حتى اليوم', en: 'Month to date' },
  yearToDate: { ar: 'من بداية السنة حتى اليوم', en: 'Year to date' },
});

const DATE_SET: ReadonlySet<string> = new Set(RELATIVE_DATE_PRESETS);
const RANGE_SET: ReadonlySet<string> = new Set(RELATIVE_DATE_RANGE_PRESETS);

export function isRelativeDatePreset(v: unknown): v is RelativeDatePreset {
  return typeof v === 'string' && DATE_SET.has(v);
}

export function isRelativeDateRangePreset(v: unknown): v is RelativeDateRangePreset {
  return typeof v === 'string' && RANGE_SET.has(v);
}

/** Local calendar date of `d` as `YYYY-MM-DD`. */
export function toLocalYmd(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar date `y-m-d` as a UTC-midnight Date (month 0-based, day may overflow: `day(2026, 9, 0)` is 2026-09-30). */
function day(y: number, m: number, d: number): Date {
  const r = new Date(Date.UTC(2000, 0, 1));
  r.setUTCFullYear(y, m, d);
  return r;
}

/** `YYYY-MM-DD` of a {@link day} value (UTC fields, so independent of the runtime time zone). */
function ymd(d: Date): string {
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Today's calendar date in `opts.timeZone` (default Asia/Riyadh) as a {@link day} value. */
function todayIn(opts?: RelativeDateOptions): Date {
  const n = opts?.now;
  const ms = n === undefined ? Date.now() : new Date(n).getTime();
  if (Number.isNaN(ms)) throw new RangeError('relative dates: invalid "now"');
  const p = zonedParts(ms, resolveTimeZone(opts?.timeZone));
  return day(p.year, p.month - 1, p.day);
}

function weekStart(t: Date, ws: WeekStart): Date {
  const back = (t.getUTCDay() - ws + 7) % 7;
  return day(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back);
}

/** Resolves a {@link RelativeDatePreset} to a `YYYY-MM-DD` calendar date in `opts.timeZone` (default Asia/Riyadh). */
export function resolveRelativeDate(preset: RelativeDatePreset, opts?: RelativeDateOptions): string {
  const n = todayIn(opts);
  const y = n.getUTCFullYear();
  const m = n.getUTCMonth();
  const d = n.getUTCDate();
  const q = Math.floor(m / 3) * 3;
  const ws = opts?.weekStartsOn ?? 0;
  let r: Date;
  switch (preset) {
    case 'today': r = day(y, m, d); break;
    case 'yesterday': r = day(y, m, d - 1); break;
    case 'tomorrow': r = day(y, m, d + 1); break;
    case 'startOfWeek': r = weekStart(n, ws); break;
    case 'endOfWeek': { const s = weekStart(n, ws); r = day(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + 6); break; }
    case 'startOfMonth': r = day(y, m, 1); break;
    case 'endOfMonth': r = day(y, m + 1, 0); break;
    case 'startOfQuarter': r = day(y, q, 1); break;
    case 'endOfQuarter': r = day(y, q + 3, 0); break;
    case 'startOfYear': r = day(y, 0, 1); break;
    case 'endOfYear': r = day(y, 11, 31); break;
    default: throw new Error(`unknown relative date preset "${String(preset)}"`);
  }
  return ymd(r);
}

/** Resolves a {@link RelativeDateRangePreset} to `{ from, to }` `YYYY-MM-DD` dates in `opts.timeZone` (both inclusive). */
export function resolveRelativeDateRange(preset: RelativeDateRangePreset, opts?: RelativeDateOptions): { from: string; to: string } {
  const n = todayIn(opts);
  const y = n.getUTCFullYear();
  const m = n.getUTCMonth();
  const d = n.getUTCDate();
  const q = Math.floor(m / 3) * 3;
  const ws = opts?.weekStartsOn ?? 0;
  const today = day(y, m, d);
  let from: Date;
  let to: Date;
  switch (preset) {
    case 'today': from = to = today; break;
    case 'yesterday': from = to = day(y, m, d - 1); break;
    case 'thisWeek': { from = weekStart(n, ws); to = day(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 6); break; }
    case 'lastWeek': {
      const s = weekStart(n, ws);
      from = day(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - 7);
      to = day(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - 1);
      break;
    }
    case 'thisMonth': from = day(y, m, 1); to = day(y, m + 1, 0); break;
    case 'lastMonth': from = day(y, m - 1, 1); to = day(y, m, 0); break;
    case 'thisQuarter': from = day(y, q, 1); to = day(y, q + 3, 0); break;
    case 'lastQuarter': from = day(y, q - 3, 1); to = day(y, q, 0); break;
    case 'thisYear': from = day(y, 0, 1); to = day(y, 11, 31); break;
    case 'lastYear': from = day(y - 1, 0, 1); to = day(y - 1, 11, 31); break;
    case 'last7Days': from = day(y, m, d - 6); to = today; break;
    case 'last30Days': from = day(y, m, d - 29); to = today; break;
    case 'monthToDate': from = day(y, m, 1); to = today; break;
    case 'yearToDate': from = day(y, 0, 1); to = today; break;
    default: throw new Error(`unknown relative date range preset "${String(preset)}"`);
  }
  return { from: ymd(from), to: ymd(to) };
}
