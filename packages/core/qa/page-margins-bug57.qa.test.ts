/**
 * BUG-57: page margins must fit the sheet.
 * A 40cm left margin on A4 is rejected. A valid margin still applies.
 * A loaded template is clamped with a warning and does not throw.
 */
import { describe, expect, it, vi } from 'vitest';
import { logger } from '../src/logging/logger.js';
import { applyPageSetup, lengthToMm, pageMarginViolation } from '../src/engine/page-setup.js';
import type { Page } from '../src/schema/report-schema.js';

function page(leftCm: number, orientation: 'portrait' | 'landscape' = 'portrait'): Page {
  return {
    size: 'A4',
    orientation,
    margins: { top: 15, right: 15, bottom: 15, left: lengthToMm(leftCm, 'cm') },
  };
}

describe('BUG-57 page margins fit the paper', () => {
  it('rejects a 40cm left margin on A4 and accepts a valid one', () => {
    expect(pageMarginViolation(page(40))).toBe('width');
    const valid = page(2);
    expect(pageMarginViolation(valid)).toBeNull();
    expect(valid.margins.left).toBe(20);
    expect(applyPageSetup(valid)).toBe(valid);
  });

  it('clamps a loaded template instead of throwing', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const loaded = page(40);
    let next: Page | undefined;
    expect(() => {
      next = applyPageSetup(loaded);
    }).not.toThrow();
    expect(next!.margins.left + next!.margins.right).toBeLessThan(210);
    expect(next!.margins.left).not.toBe(400);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
