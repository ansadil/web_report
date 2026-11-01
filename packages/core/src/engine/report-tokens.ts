/**
 * Header tokens used by report text (HTML preview and PDF):
 *
 *   {المعاملات.الفترة}  parameter period, `params.period.from/to` or `params.from` + `params.to`
 *   {المعاملات.الفرع}   branch option label, or «جميع الفروع» / "All branches" for `all`
 *   {التاريخ.هجري}      today's Umm al-Qura date in the report time zone (default Asia/Riyadh)
 *   {التاريخ}           today's Gregorian date in that same zone
 *
 * A parameter token whose value is missing or whose parameters were not resolved becomes «—»,
 * never the raw braces. Date tokens always resolve.
 */
import {
  formatHijri,
  type LocaleTag,
  type ParameterDef,
  type ParameterOption,
} from '@reports-web/shared';
import { DEFAULT_TIME_ZONE } from './time-zone.js';

export interface ReportTokenContext {
  readonly locale: LocaleTag;
  readonly timeZone?: string;
  readonly now: Date;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly parameters?: readonly ParameterDef[];
  /** False when the host rejected the parameter values. Parameter tokens then render as «—». */
  readonly paramsResolved: boolean;
}

const TOKEN_RE = /\{(?:المعاملات\.الفترة|المعاملات\.الفرع|التاريخ\.هجري|التاريخ)\}/gu;
const PLACEHOLDER = '—';

function isArabic(locale: string): boolean {
  return locale.toLowerCase().startsWith('ar');
}

function pickLabel(label: ParameterOption['label'] | undefined, locale: LocaleTag, fallback: string): string {
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object') {
    const text = isArabic(locale) ? label.ar ?? label.en : label.en ?? label.ar;
    if (text) return text;
  }
  return fallback;
}

function calendarDay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function localizeDigits(text: string, locale: string): string {
  if (!isArabic(locale)) return text;
  return text.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit);
}

/**
 * Gregorian date for a field or a report token.
 * Arabic is `٠١/١٠/٢٠٢٦م`. English stays `YYYY-MM-DD` so the value and the display match.
 */
export function formatReportDate(iso: string, locale: LocaleTag): string {
  const day = calendarDay(iso);
  if (!day) return iso;
  if (!isArabic(locale)) return day;
  const [year, month, date] = day.split('-') as [string, string, string];
  return `${localizeDigits(`${date}/${month}/${year}`, locale)}م`;
}

/** Date plus time for the parameters panel footer, in `timeZone` (default callers pass Asia/Riyadh). */
export function formatPanelStamp(when: Date, locale: LocaleTag, timeZone: string): string {
  const day = formatReportDate(zonedISODate(when, timeZone), locale);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn',
  }).formatToParts(when);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${day} ${localizeDigits(`${hour}:${minute}`, locale)}`;
}

/** Parse a report-locale date or an ISO day back to `YYYY-MM-DD`. */
export function parseReportDate(raw: string): string | undefined {
  const western = raw
    .replace(/م/g, '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .trim();
  const iso = calendarDay(western);
  if (iso) return iso;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(western);
  if (!match) return undefined;
  const day = match[1]!.padStart(2, '0');
  const month = match[2]!.padStart(2, '0');
  return calendarDay(`${match[3]}-${month}-${day}`);
}

/** English Hijri line is day, month, year: `20 Rabiʻ II 1448 AH`. */
function formatEnglishHijriLine(iso: string): string {
  const [year, month, date] = iso.split('-') as [string, string, string];
  const when = new Date(Number(year), Number(month) - 1, Number(date), 12);
  return new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(when);
}

export function formatReportHijri(iso: string, locale: LocaleTag): string {
  const day = calendarDay(iso);
  if (!day) return '';
  if (!isArabic(locale)) return formatEnglishHijriLine(day);
  return `الموافق ${formatHijri(day, locale)}`;
}

function formatCalendar(value: unknown, locale: LocaleTag): string | undefined {
  const iso = calendarDay(value);
  if (!iso) return undefined;
  return formatReportDate(iso, locale);
}

function zonedISODate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function periodText(params: Readonly<Record<string, unknown>>, locale: LocaleTag): string | undefined {
  const period = params.period;
  const from = period && typeof period === 'object' ? (period as { from?: unknown }).from : params.from;
  const to = period && typeof period === 'object' ? (period as { to?: unknown }).to : params.to;
  const start = formatCalendar(from, locale);
  const end = formatCalendar(to, locale);
  if (!start || !end) return undefined;
  return `${start} – ${end}`;
}

function branchText(params: Readonly<Record<string, unknown>>, parameters: readonly ParameterDef[] | undefined, locale: LocaleTag): string | undefined {
  const raw = params.branch;
  if (raw == null || raw === '') return undefined;
  const def = parameters?.find((parameter) => parameter.name === 'branch');
  const options = def && Array.isArray(def.options) ? def.options : [];
  const match = options.find((option) => String(option.value) === String(raw));
  if (match) return pickLabel(match.label, locale, String(raw));
  if (String(raw) === 'all') return isArabic(locale) ? 'جميع الفروع' : 'All branches';
  return undefined;
}

function parameterToken(name: 'الفترة' | 'الفرع', ctx: ReportTokenContext): string {
  if (!ctx.paramsResolved || !ctx.params) return PLACEHOLDER;
  const text = name === 'الفترة'
    ? periodText(ctx.params, ctx.locale)
    : branchText(ctx.params, ctx.parameters, ctx.locale);
  return text ?? PLACEHOLDER;
}

export function replaceReportTokens(text: string, ctx: ReportTokenContext): string {
  const timeZone = ctx.timeZone || DEFAULT_TIME_ZONE;
  const today = zonedISODate(ctx.now, timeZone);
  return text.replace(TOKEN_RE, (token) => {
    if (token === '{التاريخ.هجري}') return formatHijri(today, ctx.locale);
    if (token === '{التاريخ}') return formatReportDate(today, ctx.locale);
    if (token === '{المعاملات.الفترة}') return parameterToken('الفترة', ctx);
    return parameterToken('الفرع', ctx);
  });
}
