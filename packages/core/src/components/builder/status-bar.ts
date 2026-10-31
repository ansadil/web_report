import { resolveIntlLocale, type LocaleTag } from '@reports-web/shared';

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

/** Decimal text via `Intl.NumberFormat`. `latn` keeps Western digits. */
export function formatLocalizedNumber(value: number, fmt: DigitFormat = WESTERN, fractionDigits = 0): string {
  return new Intl.NumberFormat(numberLocale(fmt), {
    useGrouping: false,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function lengthUnit(locale: string): string {
  return locale.toLowerCase().startsWith('ar') ? 'مم' : 'mm';
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

/** Status-bar name: a human label when the element has one, otherwise its kind. */
export function elementStatusName(el: {
  kind: string;
  value?: string;
  field?: string;
  fn?: string;
  expression?: string;
  type?: string;
  symbology?: string;
  mode?: string;
}): string {
  switch (el.kind) {
    case 'text':
      return el.value?.trim() || 'text';
    case 'field':
      return el.field?.trim() || 'field';
    case 'aggregate':
      return el.fn && el.field ? `${el.fn}(${el.field})` : 'aggregate';
    case 'expr':
      return el.expression?.trim() || 'expr';
    case 'chart':
      return el.type?.trim() || 'chart';
    case 'barcode':
      return el.symbology?.trim() || 'barcode';
    case 'richtext':
      return el.mode?.trim() || 'richtext';
    default:
      return el.kind;
  }
}

export function formatPageIndicator(page: number, pages: number, fmt: DigitFormat = WESTERN): string {
  const n = Math.max(1, Math.round(page));
  const m = Math.max(n, Math.round(pages));
  return `${formatLocalizedNumber(n, fmt)} / ${formatLocalizedNumber(m, fmt)}`;
}
