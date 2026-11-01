/**
 * Page-setup checks. Schema margins are millimetres. The property panel types
 * centimetres, millimetres, or inches; those are converted before the paper test.
 *
 * Left + right and top + bottom must leave at least {@link MIN_CONTENT_MM}
 * millimetres of content on each axis, after orientation is applied. A typed
 * value that would break the rule is rejected. A loaded template, or a paper
 * size / orientation change, is clamped (with a warning) so the content area
 * never falls below that minimum.
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

/** Minimum content width and height that must remain after margins, in millimetres. */
export const MIN_CONTENT_MM = 50;

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
  if (paper.width - left - right < MIN_CONTENT_MM) return 'width';
  if (paper.height - top - bottom < MIN_CONTENT_MM) return 'height';
  return null;
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPair(a: number, b: number, paperMm: number): [number, number] {
  a = Math.max(0, Number.isFinite(a) ? a : 0);
  b = Math.max(0, Number.isFinite(b) ? b : 0);
  const maxSum = Math.max(0, paperMm - MIN_CONTENT_MM);
  if (a + b <= maxSum) return [roundMm(a), roundMm(b)];
  if (a + b === 0) return [0, 0];
  const scale = maxSum / (a + b);
  let nextA = roundMm(a * scale);
  let nextB = roundMm(b * scale);
  if (nextA + nextB > maxSum) {
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

/** Apply a paper size or orientation change, then clamp margins to {@link MIN_CONTENT_MM}. */
export function adjustPage(page: Page, patch: Partial<Pick<Page, 'size' | 'orientation'>>): { page: Page; clamped: boolean } {
  const merged: Page = { ...page, ...patch };
  const next = applyPageSetup(merged);
  return { page: next, clamped: next !== merged };
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

export function marginErrorText(axis: MarginAxis, paperLabel: string, contentLabel: string, locale: LocaleTag): string {
  const ar = locale.toLowerCase().startsWith('ar');
  if (axis === 'width') {
    return ar
      ? `يجب أن يترك الهامش الأيسر والأيمن مساحة محتوى لا تقل عن ${contentLabel} (عرض الورقة ${paperLabel})`
      : `Left and right margins must leave at least ${contentLabel} of content width (paper width ${paperLabel})`;
  }
  return ar
    ? `يجب أن يترك الهامش العلوي والسفلي مساحة محتوى لا تقل عن ${contentLabel} (ارتفاع الورقة ${paperLabel})`
    : `Top and bottom margins must leave at least ${contentLabel} of content height (paper height ${paperLabel})`;
}

/** Shown when a load or a paper change reduces margins instead of rejecting them. */
export function marginClampNotice(contentLabel: string, locale: LocaleTag): string {
  const ar = locale.toLowerCase().startsWith('ar');
  return ar
    ? `تم ضبط الهوامش لتبقى مساحة المحتوى ${contentLabel} × ${contentLabel} على الأقل.`
    : `Margins were reduced so the content area stays at least ${contentLabel} by ${contentLabel}.`;
}
