import { describe, it, expect } from 'vitest';
import {
  isRelativeDatePreset,
  isRelativeDateRangePreset,
  RELATIVE_DATE_PRESETS,
  RELATIVE_DATE_RANGE_LABELS,
  RELATIVE_DATE_RANGE_PRESETS,
  resolveRelativeDate,
  resolveRelativeDateRange,
  toLocalYmd,
} from './relative-dates.js';

// Wednesday 2026-10-14, local noon (independent of the runtime TZ)
const now = new Date(2026, 9, 14, 12, 0, 0);

describe('resolveRelativeDate', () => {
  it('resolves day / month / quarter / year presets against `now`', () => {
    const r = (p: Parameters<typeof resolveRelativeDate>[0]) => resolveRelativeDate(p, { now });
    expect(r('today')).toBe('2026-10-14');
    expect(r('yesterday')).toBe('2026-10-13');
    expect(r('tomorrow')).toBe('2026-10-15');
    expect(r('startOfMonth')).toBe('2026-10-01');
    expect(r('endOfMonth')).toBe('2026-10-31');
    expect(r('startOfQuarter')).toBe('2026-10-01');
    expect(r('endOfQuarter')).toBe('2026-12-31');
    expect(r('startOfYear')).toBe('2026-01-01');
    expect(r('endOfYear')).toBe('2026-12-31');
  });

  it('weeks start on Sunday by default and honour weekStartsOn', () => {
    expect(resolveRelativeDate('startOfWeek', { now })).toBe('2026-10-11');
    expect(resolveRelativeDate('endOfWeek', { now })).toBe('2026-10-17');
    expect(resolveRelativeDate('startOfWeek', { now, weekStartsOn: 6 })).toBe('2026-10-10');
    expect(resolveRelativeDate('startOfWeek', { now, weekStartsOn: 1 })).toBe('2026-10-12');
    expect(resolveRelativeDate('endOfWeek', { now, weekStartsOn: 1 })).toBe('2026-10-18');
  });

  it('handles month / year boundaries and leap years', () => {
    expect(resolveRelativeDate('yesterday', { now: new Date(2026, 0, 1, 9) })).toBe('2025-12-31');
    expect(resolveRelativeDate('tomorrow', { now: new Date(2026, 11, 31, 9) })).toBe('2027-01-01');
    expect(resolveRelativeDate('endOfMonth', { now: new Date(2028, 1, 10) })).toBe('2028-02-29');
    expect(resolveRelativeDate('endOfMonth', { now: new Date(2026, 1, 10) })).toBe('2026-02-28');
    expect(resolveRelativeDate('endOfQuarter', { now: new Date(2026, 4, 5) })).toBe('2026-06-30');
  });

  it('accepts epoch ms and defaults to the current date', () => {
    expect(resolveRelativeDate('today', { now: now.getTime() })).toBe('2026-10-14');
    expect(resolveRelativeDate('today')).toBe(toLocalYmd(new Date()));
  });
});

describe('resolveRelativeDateRange', () => {
  const r = (p: Parameters<typeof resolveRelativeDateRange>[0]) => resolveRelativeDateRange(p, { now });
  it('resolves calendar ranges (inclusive)', () => {
    expect(r('today')).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(r('yesterday')).toEqual({ from: '2026-10-13', to: '2026-10-13' });
    expect(r('thisWeek')).toEqual({ from: '2026-10-11', to: '2026-10-17' });
    expect(r('lastWeek')).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(r('thisMonth')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(r('lastMonth')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(r('thisQuarter')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(r('lastQuarter')).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(r('thisYear')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(r('lastYear')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(r('last7Days')).toEqual({ from: '2026-10-08', to: '2026-10-14' });
    expect(r('last30Days')).toEqual({ from: '2026-09-15', to: '2026-10-14' });
    expect(r('monthToDate')).toEqual({ from: '2026-10-01', to: '2026-10-14' });
    expect(r('yearToDate')).toEqual({ from: '2026-01-01', to: '2026-10-14' });
  });

  it('crosses year boundaries for last month / quarter', () => {
    const jan = { now: new Date(2026, 0, 15) };
    expect(resolveRelativeDateRange('lastMonth', jan)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(resolveRelativeDateRange('lastQuarter', jan)).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(resolveRelativeDateRange('lastMonth', { now: new Date(2028, 2, 31) })).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('every preset has ar / en labels and the guards recognise them', () => {
    for (const p of RELATIVE_DATE_RANGE_PRESETS) {
      expect(isRelativeDateRangePreset(p)).toBe(true);
      expect(RELATIVE_DATE_RANGE_LABELS[p].ar).toBeTruthy();
      expect(RELATIVE_DATE_RANGE_LABELS[p].en).toBeTruthy();
    }
    for (const p of RELATIVE_DATE_PRESETS) expect(isRelativeDatePreset(p)).toBe(true);
    expect(isRelativeDateRangePreset('2026-10-01')).toBe(false);
    expect(isRelativeDatePreset('thisMonth')).toBe(false);
    expect(isRelativeDatePreset(undefined)).toBe(false);
  });
});
