import { describe, expect, it, vi } from 'vitest';
import { logger } from '../logging/logger.js';
import {
  applyPageSetup,
  lengthToMm,
  mmToLength,
  pageMarginViolation,
  paperSizeMm,
} from './page-setup.js';
import type { Page } from '../schema/report-schema.js';

function page(margins: Page['margins'], orientation: Page['orientation'] = 'portrait', size: Page['size'] = 'A4'): Page {
  return { size, orientation, margins };
}

describe('page setup margins', () => {
  it('rejects a 40cm left margin on A4 and still accepts a valid margin', () => {
    expect(lengthToMm(40, 'cm')).toBe(400);
    const rejected = page({ top: 15, right: 15, bottom: 15, left: lengthToMm(40, 'cm') });
    expect(pageMarginViolation(rejected)).toBe('width');
    const accepted = page({ top: 15, right: 15, bottom: 15, left: lengthToMm(2, 'cm') });
    expect(pageMarginViolation(accepted)).toBeNull();
    expect(accepted.margins.left).toBe(20);
  });

  it('respects orientation and mm/cm/in', () => {
    expect(paperSizeMm('A4', 'portrait')).toEqual({ width: 210, height: 297 });
    expect(paperSizeMm('A4', 'landscape')).toEqual({ width: 297, height: 210 });
    expect(lengthToMm(1, 'in')).toBe(25.4);
    expect(mmToLength(25.4, 'in')).toBe(1);
    expect(lengthToMm(40, 'mm')).toBe(40);
    const tall = page({ top: lengthToMm(8, 'in'), right: 10, bottom: 10, left: 10 }, 'landscape');
    expect(pageMarginViolation(tall)).toBe('height');
    const wideMm = page({ top: 10, right: 10, bottom: 10, left: 200 });
    expect(pageMarginViolation(wideMm)).toBe('width');
  });

  it('clamps a loaded template with a warning and does not throw', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const loaded = page({ top: 15, right: 15, bottom: 15, left: 400 });
    let clamped: Page | undefined;
    expect(() => {
      clamped = applyPageSetup(loaded);
    }).not.toThrow();
    expect(clamped!.margins.left + clamped!.margins.right).toBeLessThan(210);
    expect(clamped!.margins.top + clamped!.margins.bottom).toBeLessThan(297);
    expect(clamped!.margins.left).toBeLessThan(400);
    expect(warn).toHaveBeenCalledWith('page-setup', 'clamped page margins to fit the paper', expect.objectContaining({ size: 'A4' }));
    const valid = page({ top: 15, right: 15, bottom: 15, left: 20 });
    expect(applyPageSetup(valid)).toBe(valid);
    warn.mockRestore();
  });
});
