/**
 * BUG-71: a 0.01 mm float gap still counts as 50 mm of content.
 * BUG-73: clamping pulls group-footer elements back inside the content area,
 * and only the margin that does not fit is reduced.
 */
import { describe, expect, it, vi } from 'vitest';
import { logger } from '../src/logging/logger.js';
import { withReclampedRootElements } from '../src/components/builder/ops/elements.js';
import {
  MIN_CONTENT_MM,
  adjustPage,
  applyPageSetup,
  lengthToMm,
  pageMarginViolation,
  paperSizeMm,
} from '../src/engine/page-setup.js';
import type { Page } from '../src/schema/report-schema.js';

function margins(leftCm: number, rightCm: number, orientation: Page['orientation'] = 'portrait', size: Page['size'] = 'A4'): Page {
  return {
    size,
    orientation,
    margins: { top: 15, right: lengthToMm(rightCm, 'cm'), bottom: 15, left: lengthToMm(leftCm, 'cm') },
  };
}

describe('BUG-71 margin tolerance', () => {
  it('accepts Letter landscape margins that leave exactly 50 mm of content', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const page = margins(11.47, 11.47, 'landscape', 'Letter');
    const paper = paperSizeMm('Letter', 'landscape');
    expect(paper.width - page.margins.left - page.margins.right).toBeCloseTo(MIN_CONTENT_MM, 5);
    expect(pageMarginViolation(page)).toBeNull();
    expect(applyPageSetup(page)).toBe(page);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('BUG-73 clamp keeps the valid margin and brings group sums back inside', () => {
  it('keeps a 1.5 cm right margin when the left margin is 40 cm', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const next = applyPageSetup(margins(40, 1.5));
    expect(next.margins.right).toBe(lengthToMm(1.5, 'cm'));
    expect(next.margins.left).toBeLessThan(lengthToMm(40, 'cm'));
    const paper = paperSizeMm('A4', 'portrait');
    expect(paper.width - next.margins.left - next.margins.right).toBeGreaterThanOrEqual(MIN_CONTENT_MM);
    warn.mockRestore();
  });

  it('pulls a group-footer sum back inside after landscape 12 cm + 11 cm becomes portrait', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const portrait = adjustPage(margins(12, 11, 'landscape'), { orientation: 'portrait' });
    const schema = {
      page: portrait.page,
      bands: { detail: { height: 8, elements: [] } },
      groups: [{
        key: 'region',
        footer: {
          height: 8,
          elements: [{ id: 'sum', kind: 'aggregate' as const, fn: 'sum' as const, field: 'amount', scope: 'group' as const, pos: { x: 130, y: 1, w: 50, h: 6 } }],
        },
      }],
    };
    const next = withReclampedRootElements(schema as never);
    const pos = next.groups[0]!.footer!.elements[0]!.pos;
    const width = portrait.page.size === 'A4'
      ? 210 - portrait.page.margins.left - portrait.page.margins.right
      : 0;
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.x + pos.w).toBeLessThanOrEqual(width + 0.01);
    expect(pos.x).toBeLessThan(130);
    warn.mockRestore();
  });
});
