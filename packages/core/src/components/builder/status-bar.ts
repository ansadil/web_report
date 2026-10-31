import { resolveIntlLocale, type LocaleTag } from '@reports-web/shared';
import { t } from '../../i18n/strings.js';

export interface DigitFormat {
  /** BCP 47 tag used when `digits` is `locale`. */
  locale: string;
  /** `latn` forces Western digits even for an Arabic locale. */
  digits: 'locale' | 'latn';
}

const WESTERN: DigitFormat = { locale: 'en', digits: 'latn' };

function numberLocale(fmt: DigitFormat): string {
  return fmt.digits === 'latn' ? 'en' : resolveIntlLocale(fmt.locale as LocaleTag);
}

/** Parse Western or Arabic-Indic digits. Non-numeric text becomes NaN. */
export function parseLocalizedNumber(raw: string): number {
  const western = raw
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[^\d.-]/g, '');
  return western === '' || western === '-' || western === '.' ? Number.NaN : Number(western);
}

/** Decimal text via `Intl.NumberFormat`. `latn` keeps Western digits. */
export function formatLocalizedNumber(value: number, fmt: DigitFormat = WESTERN, fractionDigits = 0): string {
  return new Intl.NumberFormat(numberLocale(fmt), {
    useGrouping: false,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function lengthUnit(locale: string): string {
  return t(locale as LocaleTag, 'unitMm');
}

export function formatZoomPercent(zoom: number, fmt: DigitFormat = WESTERN): string {
  return new Intl.NumberFormat(numberLocale(fmt), {
    style: 'percent',
    useGrouping: false,
    maximumFractionDigits: 0,
  }).format(zoom);
}

export function formatCursorMm(point: { x: number; y: number } | null, fmt: DigitFormat = WESTERN): string {
  if (!point) return '—';
  const x = formatLocalizedNumber(point.x, fmt, 1);
  const y = formatLocalizedNumber(point.y, fmt, 1);
  return `${x} × ${y} ${lengthUnit(fmt.locale)}`;
}

export function formatSelectionSummary(
  input: { name: string; w: number; h: number } | null,
  fmt: DigitFormat = WESTERN,
): string {
  if (!input) return '—';
  const w = formatLocalizedNumber(input.w, fmt, 1);
  const h = formatLocalizedNumber(input.h, fmt, 1);
  return `${input.name} · ${w} × ${h} ${lengthUnit(fmt.locale)}`;
}

type KindLabel =
  | 'text'
  | 'field'
  | 'image'
  | 'chart'
  | 'expression'
  | 'aggregate'
  | 'line'
  | 'box'
  | 'qr'
  | 'barcode'
  | 'html'
  | 'markdown';

function kindLabel(kind: string, mode?: string): KindLabel {
  if (kind === 'expr') return 'expression';
  if (kind === 'richtext') return mode === 'markdown' ? 'markdown' : 'html';
  if (
    kind === 'text' ||
    kind === 'field' ||
    kind === 'image' ||
    kind === 'chart' ||
    kind === 'aggregate' ||
    kind === 'line' ||
    kind === 'box' ||
    kind === 'qr' ||
    kind === 'barcode'
  ) {
    return kind;
  }
  return 'text';
}

/** Status-bar name: a human label when the element has one, otherwise its kind. */
export function elementStatusName(
  el: {
    kind: string;
    value?: string;
    field?: string;
    fn?: string;
    expression?: string;
    type?: string;
    symbology?: string;
    mode?: string;
  },
  locale: LocaleTag = 'en',
): string {
  const fallback = t(locale, kindLabel(el.kind, el.mode));
  switch (el.kind) {
    case 'text':
      return el.value?.trim() || fallback;
    case 'field':
      return el.field?.trim() || fallback;
    case 'aggregate':
      return el.fn && el.field ? `${el.fn}(${el.field})` : fallback;
    case 'expr':
      return el.expression?.trim() || fallback;
    case 'chart':
      return el.type?.trim() || fallback;
    case 'barcode':
      return el.symbology?.trim() || fallback;
    case 'richtext':
      return fallback;
    default:
      return fallback;
  }
}

export function formatPageIndicator(page: number, pages: number, fmt: DigitFormat = WESTERN): string {
  const n = Math.max(1, Math.round(page));
  const m = Math.max(n, Math.round(pages));
  return `${formatLocalizedNumber(n, fmt)} / ${formatLocalizedNumber(m, fmt)}`;
}
