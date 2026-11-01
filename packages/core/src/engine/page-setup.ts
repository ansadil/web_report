/**
 * Page-setup checks. Schema margins are millimetres. The property panel types
 * centimetres, millimetres, or inches; those are converted before the paper test.
 *
 * Left + right must be strictly less than the paper width, and top + bottom
 * strictly less than the paper height, after orientation is applied. A loaded
 * template that breaks the rule is clamped (with a warning), not rejected.
 */
import type { LocaleTag } from '@reports-web/shared';
import { logger } from '../logging/logger.js';
import type { Page } from '../schema/report-schema.js';

export type LengthUnit = 'mm' | 'cm' | 'in';
export type MarginSide = 'top' | 'right' | 'bottom' | 'left';
export type MarginAxis = 'width' | 'height';

const PORTRAIT_MM = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
} as const;

/** One millimetre of content is left so the pair stays strictly inside the sheet. */
const MIN_CONTENT_MM = 1;

const MM_PER_UNIT: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4 };

export function paperSizeMm(size: Page['size'], orientation: Page['orientation']): { width: number; height: number } {
  const portrait = PORTRAIT_MM[size];
  return orientation === 'landscape'
    ? { width: portrait.height, height: portrait.width }
    : portrait;
}

export function lengthToMm(value: number, unit: LengthUnit): number {
  return value * MM_PER_UNIT[unit];
}

export function mmToLength(mm: number, unit: LengthUnit): number {
  return mm / MM_PER_UNIT[unit];
}

export function pageMarginViolation(page: Pick<Page, 'size' | 'orientation' | 'margins'>): MarginAxis | 'negative' | null {
  const { top, right, bottom, left } = page.margins;
  if ([top, right, bottom, left].some((n) => !Number.isFinite(n) || n < 0)) return 'negative';
  const paper = paperSizeMm(page.size, page.orientation);
  if (left + right >= paper.width) return 'width';
  if (top + bottom >= paper.height) return 'height';
  return null;
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPair(a: number, b: number, limit: number): [number, number] {
  a = Math.max(0, Number.isFinite(a) ? a : 0);
  b = Math.max(0, Number.isFinite(b) ? b : 0);
  if (a + b < limit) return [roundMm(a), roundMm(b)];
  const maxSum = Math.max(0, limit - MIN_CONTENT_MM);
  if (a + b === 0) return [0, 0];
  const scale = maxSum / (a + b);
  let nextA = roundMm(a * scale);
  let nextB = roundMm(b * scale);
  if (nextA + nextB >= limit) {
    const overflow = nextA + nextB - maxSum;
    if (nextA >= nextB) nextA = roundMm(Math.max(0, nextA - overflow));
    else nextB = roundMm(Math.max(0, nextB - overflow));
  }
  return [nextA, nextB];
}

export function normalizePageSetup(page: Page): { page: Page; clamped: boolean } {
  const paper = paperSizeMm(page.size, page.orientation);
  const [left, right] = clampPair(page.margins.left, page.margins.right, paper.width);
  const [top, bottom] = clampPair(page.margins.top, page.margins.bottom, paper.height);
  const margins = { top, right, bottom, left };
  const before = page.margins;
  const clamped = (['top', 'right', 'bottom', 'left'] as const).some((side) => before[side] !== margins[side]);
  if (!clamped) return { page, clamped: false };
  return { page: { ...page, margins }, clamped: true };
}

/** Clamp a loaded template's margins so they fit the sheet. Never throws. */
export function applyPageSetup(page: Page): Page {
  const result = normalizePageSetup(page);
  if (!result.clamped) return page;
  logger.warn('page-setup', 'clamped page margins to fit the paper', {
    size: page.size,
    orientation: page.orientation,
    before: page.margins,
    after: result.page.margins,
  });
  return result.page;
}

export function marginNumberError(kind: 'nan' | 'negative', locale: LocaleTag): string {
  const ar = locale.toLowerCase().startsWith('ar');
  if (kind === 'nan') return ar ? 'أدخل رقمًا' : 'Enter a number';
  return ar ? 'يجب أن يكون الهامش صفرًا أو أكبر' : 'Margin must be zero or greater';
}

export function marginErrorText(axis: MarginAxis, limitLabel: string, locale: LocaleTag): string {
  const ar = locale.toLowerCase().startsWith('ar');
  if (axis === 'width') {
    return ar
      ? `يجب أن يكون مجموع الهامش الأيسر والأيمن أقل من عرض الورقة (${limitLabel})`
      : `Left and right margins must be less than the paper width (${limitLabel})`;
  }
  return ar
    ? `يجب أن يكون مجموع الهامش العلوي والسفلي أقل من ارتفاع الورقة (${limitLabel})`
    : `Top and bottom margins must be less than the paper height (${limitLabel})`;
}
