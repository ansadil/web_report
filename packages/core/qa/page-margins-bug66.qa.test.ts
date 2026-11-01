/**
 * BUG-66: margins must leave at least 50mm of content on each axis.
 * BUG-67: changing orientation or paper size clamps margins that no longer fit,
 * including landscape -> portrait and A5 landscape.
 */
import { describe, expect, it, vi } from 'vitest';
import { logger } from '../src/logging/logger.js';
import {
  MIN_CONTENT_MM,
  adjustPage,
  applyPageSetup,
  lengthToMm,
  pageMarginViolation,
  paperSizeMm,
} from '../src/engine/page-setup.js';
import type { Page } from '../src/schema/report-schema.js';

function page(
  margins: Partial<Page['margins']> & Pick<Page['margins'], 'left' | 'right'>,
  orientation: Page['orientation'] = 'portrait',
  size: Page['size'] = 'A4',
): Page {
  return {
    size,
    orientation,
    margins: { top: 15, bottom: 15, ...margins },
  };
}

function contentWidth(value: Page): number {
  const paper = paperSizeMm(value.size, value.orientation);
  return paper.width - value.margins.left - value.margins.right;
}

describe('BUG-66 minimum content area', () => {
  it('rejects A4 portrait left 10cm and right 10.4cm', () => {
    const tight = page({ left: lengthToMm(10, 'cm'), right: lengthToMm(10.4, 'cm') });
    expect(pageMarginViolation(tight)).toBe('width');
    expect(contentWidth(tight)).toBeLessThan(MIN_CONTENT_MM);
  });

  it('clamps a loaded 40cm margin to at least 50mm of content', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const loaded = page({ left: lengthToMm(40, 'cm'), right: 15 });
    const next = applyPageSetup(loaded);
    expect(contentWidth(next)).toBeGreaterThanOrEqual(MIN_CONTENT_MM);
    expect(contentWidth(next)).toBeGreaterThan(5);
    expect(next.margins.left).toBeLessThan(lengthToMm(40, 'cm'));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('BUG-67 paper changes clamp margins', () => {
  it('clamps A4 landscape left 14cm and right 14cm when switched to portrait', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const landscape = page(
      { left: lengthToMm(14, 'cm'), right: lengthToMm(14, 'cm') },
      'landscape',
    );
    const portrait = adjustPage(landscape, { orientation: 'portrait' });
    expect(portrait.clamped).toBe(true);
    expect(portrait.page.orientation).toBe('portrait');
    expect(contentWidth(portrait.page)).toBeGreaterThanOrEqual(MIN_CONTENT_MM);
    const kept = Math.max(portrait.page.margins.left, portrait.page.margins.right);
    const reduced = Math.min(portrait.page.margins.left, portrait.page.margins.right);
    expect(kept).toBe(lengthToMm(14, 'cm'));
    expect(reduced).toBeLessThan(lengthToMm(14, 'cm'));
    warn.mockRestore();
  });

  it('clamps A5 landscape margins that no longer fit in portrait', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const landscape = page(
      { left: lengthToMm(7, 'cm'), right: lengthToMm(7, 'cm') },
      'landscape',
      'A5',
    );
    expect(pageMarginViolation(landscape)).toBeNull();
    const portrait = adjustPage(landscape, { orientation: 'portrait' });
    expect(portrait.clamped).toBe(true);
    expect(portrait.page.size).toBe('A5');
    expect(contentWidth(portrait.page)).toBeGreaterThanOrEqual(MIN_CONTENT_MM);
    const paper = paperSizeMm('A5', 'portrait');
    expect(paper.height - portrait.page.margins.top - portrait.page.margins.bottom).toBeGreaterThanOrEqual(MIN_CONTENT_MM);
    warn.mockRestore();
  });
});
