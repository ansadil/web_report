/**
 * BUG-52 / BUG-54 / BUG-56: parameters in an explicit IANA time zone (default Asia/Riyadh). These tests never depend
 * on the process TZ: every instant is built from an ISO string with a zone, and CI also runs them under TZ=UTC and
 * TZ=America/New_York.
 */
import { describe, it, expect } from 'vitest';
import type { ParameterDef } from '@reports-web/shared';
import {
  buildDataQuery,
  formatParameterIssue,
  getParameterDefinitions,
  resolveParameterValues,
  validateParameterValues,
} from './parameters.js';
import { resolveRelativeDate, resolveRelativeDateRange } from './relative-dates.js';
import { DEFAULT_TIME_ZONE, isValidTimeZone, resolveTimeZone, zonedTimeToInstant } from './time-zone.js';
import { validateReport } from '../schema/report-schema.js';

const FSI = '\u2068';
const PDI = '\u2069';
const LATIN_DIGIT_OR_ISO = /[0-9TZ]/;

// 2026-10-31T22:30Z is Sunday 2026-11-01 01:30 in Riyadh, but still Saturday 2026-10-31 in UTC / New York.
const lateUtc = new Date('2026-10-31T22:30:00Z');
const newYearRiyadh = new Date('2026-01-01T00:30:00+03:00'); // 2025-12-31T21:30Z

describe('time zone helpers', () => {
  it('defaults to Asia/Riyadh and rejects invalid IANA names', () => {
    expect(DEFAULT_TIME_ZONE).toBe('Asia/Riyadh');
    expect(resolveTimeZone()).toBe('Asia/Riyadh');
    expect(resolveTimeZone('')).toBe('Asia/Riyadh');
    expect(resolveTimeZone('UTC')).toBe('UTC');
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone(3)).toBe(false);
    expect(() => resolveTimeZone('Mars/Olympus')).toThrow(RangeError);
  });

  it('converts a wall time in a zone to an instant (incl. DST in New York)', () => {
    expect(new Date(zonedTimeToInstant('Asia/Riyadh', 2026, 11, 1, 0, 0, 0, 0)).toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(new Date(zonedTimeToInstant('America/New_York', 2026, 7, 1, 0, 0, 0, 0)).toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(new Date(zonedTimeToInstant('America/New_York', 2026, 1, 1, 0, 0, 0, 0)).toISOString()).toBe('2026-01-01T05:00:00.000Z');
  });
});

describe('BUG-52: relative dates use the configured time zone, not the process TZ', () => {
  it('today / thisMonth / lastMonth at 2026-10-31T22:30Z are Riyadh dates by default', () => {
    expect(resolveRelativeDate('today', { now: lateUtc })).toBe('2026-11-01');
    expect(resolveRelativeDateRange('thisMonth', { now: lateUtc })).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(resolveRelativeDateRange('lastMonth', { now: lateUtc })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolveRelativeDateRange('thisWeek', { now: lateUtc })).toEqual({ from: '2026-11-01', to: '2026-11-07' });
    expect(resolveRelativeDate('endOfQuarter', { now: lateUtc })).toBe('2026-12-31');
  });

  it('an explicit timeZone changes the calendar day', () => {
    for (const timeZone of ['UTC', 'America/New_York']) {
      expect(resolveRelativeDate('today', { now: lateUtc, timeZone })).toBe('2026-10-31');
      expect(resolveRelativeDateRange('thisMonth', { now: lateUtc, timeZone })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
      expect(resolveRelativeDateRange('lastMonth', { now: lateUtc, timeZone })).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    }
    expect(resolveRelativeDate('today', { now: lateUtc, timeZone: 'Asia/Riyadh' })).toBe('2026-11-01');
  });

  it('yearToDate at 2026-01-01T00:30+03:00 starts on 2026-01-01', () => {
    expect(resolveRelativeDateRange('yearToDate', { now: newYearRiyadh })).toEqual({ from: '2026-01-01', to: '2026-01-01' });
    expect(resolveRelativeDateRange('yearToDate', { now: newYearRiyadh, timeZone: 'UTC' })).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('rejects an invalid time zone instead of silently using the runtime zone', () => {
    expect(() => resolveRelativeDate('today', { now: lateUtc, timeZone: 'Nowhere/City' })).toThrow(RangeError);
    const defs: ParameterDef[] = [{ name: 'd', type: 'date', default: 'today' }];
    expect(() => resolveParameterValues(defs, {}, { now: lateUtc, timeZone: 'Nowhere/City' })).toThrow(/invalid time zone/);
  });

  const report = () => {
    const r = validateReport({
      version: '1', id: 'tz', meta: { name: 'TZ', locale: 'ar-SA', dir: 'rtl' },
      dataset: { adapter: 'custom', source: 's' },
      fields: [],
      parameters: [
        { name: 'period', type: 'dateRange', required: true, default: 'thisMonth' },
        { name: 'asOf', type: 'date', default: 'today' },
      ],
      bands: { detail: { height: 5 } },
    });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('getParameterDefinitions, validateParameterValues and buildDataQuery all honour timeZone', () => {
    const riyadh = { period: { from: '2026-11-01', to: '2026-11-30' }, asOf: '2026-11-01' };
    const utc = { period: { from: '2026-10-01', to: '2026-10-31' }, asOf: '2026-10-31' };
    expect(getParameterDefinitions(report(), { now: lateUtc }).map((d) => d.defaultValue)).toEqual([riyadh.period, riyadh.asOf]);
    expect(getParameterDefinitions(report(), { now: lateUtc, timeZone: 'UTC' }).map((d) => d.defaultValue)).toEqual([utc.period, utc.asOf]);
    expect(validateParameterValues(report(), {}, { now: lateUtc }).values).toEqual(riyadh);
    expect(validateParameterValues(report(), {}, { now: lateUtc, timeZone: 'America/New_York' }).values).toEqual(utc);
    expect(buildDataQuery(report(), {}, { now: lateUtc }).params).toEqual(riyadh);
    expect(buildDataQuery(report(), {}, { now: lateUtc, timeZone: 'UTC' }).params).toEqual(utc);
  });

  it('Date / epoch / zoned ISO values become calendar dates in the time zone', () => {
    const defs: ParameterDef[] = [{ name: 'd', type: 'date' }, { name: 'p', type: 'dateRange' }];
    const vals = { d: lateUtc, p: { from: lateUtc.getTime(), to: '2026-10-31T23:59:00-04:00' } };
    expect(resolveParameterValues(defs, vals)).toEqual({ ok: true, values: { d: '2026-11-01', p: { from: '2026-11-01', to: '2026-11-01' } } });
    expect(resolveParameterValues(defs, vals, { timeZone: 'UTC' })).toEqual({
      ok: true, values: { d: '2026-10-31', p: { from: '2026-10-31', to: '2026-11-01' } },
    });
    expect(resolveParameterValues(defs, vals, { timeZone: 'America/New_York' })).toEqual({
      ok: true, values: { d: '2026-10-31', p: { from: '2026-10-31', to: '2026-10-31' } },
    });
    // a plain calendar date never shifts
    expect(resolveParameterValues(defs, { d: '2026-11-01' }, { timeZone: 'Pacific/Kiritimati' })).toEqual({ ok: true, values: { d: '2026-11-01' } });
  });

  it('zone-less datetime bounds are wall times in the time zone', () => {
    const defs: ParameterDef[] = [{ name: 't', type: 'datetime', min: '2026-11-01T00:00' }];
    // 21:30Z = 00:30 Riyadh -> ok; 20:59Z = 23:59 Riyadh on Oct 31 -> too early
    expect(resolveParameterValues(defs, { t: '2026-10-31T21:30:00Z' }).ok).toBe(true);
    expect(resolveParameterValues(defs, { t: '2026-10-31T20:59:00Z' }).ok).toBe(false);
    // in New York the same bound is 04:00Z
    expect(resolveParameterValues(defs, { t: '2026-11-01T03:59:00Z' }, { timeZone: 'America/New_York' }).ok).toBe(false);
    expect(resolveParameterValues(defs, { t: '2026-11-01T04:00:00Z' }, { timeZone: 'America/New_York' }).ok).toBe(true);
  });
});

describe('BUG-54: datetime bounds are formatted for the locale and time zone', () => {
  const defs: ParameterDef[] = [{ name: 'at', type: 'datetime', label: { ar: 'الوقت', en: 'Time' }, min: 'now' }];
  const early = { at: '2026-10-31T20:00:00Z' };

  it('Arabic: Arabic-Indic digits, Riyadh wall time, bidi-isolated, no raw ISO', () => {
    const msg = validateParameterValues(defs, early, { locale: 'ar', now: lateUtc }).fieldErrors.at!;
    expect(msg.startsWith('يجب ألا')).toBe(true);
    const bound = msg.slice(msg.indexOf(FSI));
    expect(bound.startsWith(FSI) && bound.endsWith(PDI)).toBe(true);
    expect(bound).toContain('٢٠٢٦-١١-٠١ ٠١:٣٠'); // 22:30Z = 01:30 Riyadh, 1 November
    expect(bound.replace('Asia/Riyadh', '')).not.toMatch(LATIN_DIGIT_OR_ISO);
  });

  it('English: Latin digits in the configured zone, no ISO T/Z', () => {
    const msg = validateParameterValues(defs, early, { locale: 'en', now: lateUtc, timeZone: 'UTC' }).fieldErrors.at!;
    expect(msg).toContain('2026-10-31 22:30');
    expect(msg).not.toContain('2026-10-31T');
    expect(msg).not.toMatch(/Z\b/);
    expect(validateParameterValues(defs, early, { locale: 'en', now: lateUtc }).fieldErrors.at).toContain('2026-11-01 01:30');
  });

  it('formatParameterIssue takes the time zone and isolates date bounds in Arabic', () => {
    const at = { name: 'at', type: 'datetime' as const };
    const ar = formatParameterIssue({ rule: 'max', args: { max: '2026-10-31T22:30:00Z' } }, at, 'ar', { timeZone: 'America/New_York' });
    expect(ar).toContain('١٨:٣٠'); // 18:30 in New York (EDT)
    expect(ar).toContain(FSI);
    const d = formatParameterIssue({ rule: 'min', args: { min: '2020-01-01' } }, { name: 'd', type: 'date' }, 'ar');
    expect(d).toContain(`${FSI}٢٠٢٠-٠١-٠١${PDI}`);
    expect(formatParameterIssue({ rule: 'min', args: { min: '2020-01-01' } }, { name: 'd', type: 'date' }, 'en')).toBe('Must not be before 2020-01-01');
  });
});

describe('BUG-60: datetime bounds name the time zone and use an unambiguous order', () => {
  const at = { name: 'at', type: 'datetime' as const, label: { ar: 'الوقت', en: 'Time' } };
  const max = { rule: 'max' as const, args: { max: '2026-10-31T22:30:00Z' } };

  it('English: YYYY-MM-DD HH:mm, UTC offset and IANA id (never US 11/01/2026)', () => {
    expect(formatParameterIssue(max, at, 'en')).toBe('Must not be after 2026-11-01 01:30 GMT+3 (Asia/Riyadh)');
    expect(formatParameterIssue(max, at, 'en', { timeZone: 'Asia/Dubai' })).toBe('Must not be after 2026-11-01 02:30 GMT+4 (Asia/Dubai)');
    expect(formatParameterIssue(max, at, 'en', { timeZone: 'UTC' })).toBe('Must not be after 2026-10-31 22:30 GMT+0 (UTC)');
    expect(formatParameterIssue(max, at, 'en', { timeZone: 'Asia/Kolkata' })).toContain('2026-11-01 04:00 GMT+5:30 (Asia/Kolkata)');
    // en-GB / en-US report locales get the same unambiguous text
    expect(formatParameterIssue(max, at, 'en-US')).toBe(formatParameterIssue(max, at, 'en-GB'));
    expect(formatParameterIssue(max, at, 'en-US')).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('English: DST-correct offset and seconds only when non-zero', () => {
    // New York: EDT (GMT-4) before 2026-11-01 06:00Z, EST (GMT-5) after
    expect(formatParameterIssue(max, at, 'en', { timeZone: 'America/New_York' })).toContain('2026-10-31 18:30 GMT-4 (America/New_York)');
    const winter = { rule: 'max' as const, args: { max: '2026-12-01T12:00:05Z' } };
    expect(formatParameterIssue(winter, at, 'en', { timeZone: 'America/New_York' })).toContain('2026-12-01 07:00:05 GMT-5 (America/New_York)');
  });

  it('Arabic: same order with Arabic-Indic digits, غرينتش offset, isolated date-time and IANA id', () => {
    const LRI = '\u2066';
    expect(formatParameterIssue(max, at, 'ar')).toBe(
      `يجب ألا يكون التاريخ بعد ${FSI}${LRI}٢٠٢٦-١١-٠١ ٠١:٣٠${PDI} غرينتش+٣ (${FSI}Asia/Riyadh${PDI})${PDI}`,
    );
    const dubai = formatParameterIssue(max, at, 'ar-AE', { timeZone: 'Asia/Dubai' });
    expect(dubai).toContain(`${LRI}٢٠٢٦-١١-٠١ ٠٢:٣٠${PDI} غرينتش+٤ (${FSI}Asia/Dubai${PDI})`);
    expect(formatParameterIssue(max, at, 'ar', { timeZone: 'America/New_York' })).toContain('غرينتش-٤');
  });

  it('min-after-max definition errors carry the zone too', () => {
    const defs: ParameterDef[] = [{ name: 't', type: 'datetime', min: '2026-11-02T00:00', max: '2026-11-01T00:00' }];
    const [en] = getParameterDefinitions(defs, { locale: 'en' });
    expect(en!.definitionError).toContain('2026-11-02 00:00 GMT+3 (Asia/Riyadh)');
    expect(en!.definitionError).toContain('2026-11-01 00:00 GMT+3 (Asia/Riyadh)');
    const [ar] = getParameterDefinitions(defs, { locale: 'ar' });
    expect(ar!.definitionError).toContain('٢٠٢٦-١١-٠٢ ٠٠:٠٠');
    expect(ar!.definitionError).toContain('غرينتش+٣');
  });
});

describe('BUG-56: resolved min after max is a definition error', () => {
  const defs: ParameterDef[] = [
    { name: 'd', type: 'date', label: { ar: 'التاريخ', en: 'Date' }, required: true, min: 'today', max: 'startOfMonth' },
  ];
  const mid = new Date('2026-11-15T12:00:00+03:00');

  it('getParameterDefinitions reports a localized definitionError', () => {
    const [ar] = getParameterDefinitions(defs, { locale: 'ar', now: mid });
    expect(ar!.min).toBe('2026-11-15');
    expect(ar!.max).toBe('2026-11-01');
    expect(ar!.definitionError).toBe(`إعدادات المعامل غير صالحة: الحد الأدنى للتاريخ ${FSI}٢٠٢٦-١١-١٥${PDI} بعد الحد الأقصى ${FSI}٢٠٢٦-١١-٠١${PDI}`);
    const [en] = getParameterDefinitions(defs, { locale: 'en', now: mid });
    expect(en!.definitionError).toBe('Invalid parameter settings: the minimum date 2026-11-15 is after the maximum date 2026-11-01');
  });

  it('validation fails with rule "bounds" whatever the value (and for a missing required value)', () => {
    for (const values of [{ d: '2026-11-10' }, { d: '2026-11-15' }, {}]) {
      const r = validateParameterValues(defs, values, { locale: 'ar', now: mid });
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toMatchObject({ name: 'd', rule: 'bounds' });
      expect(r.fieldErrors.d).toContain('إعدادات المعامل غير صالحة');
    }
    expect(() => buildDataQuery({ parameters: defs }, { d: '2026-11-10' }, { now: mid })).toThrow(/min 2026-11-15 is after max 2026-11-01/);
  });

  it('no error when the bounds are consistent (same day) or the optional value is missing', () => {
    const first = new Date('2026-11-01T12:00:00+03:00');
    expect(getParameterDefinitions(defs, { now: first })[0]!.definitionError).toBeUndefined();
    expect(validateParameterValues(defs, { d: '2026-11-01' }, { now: first }).ok).toBe(true);
    expect(validateParameterValues([{ ...defs[0]!, required: false }], {}, { now: mid }).ok).toBe(true);
  });

  it('works for numbers and datetimes passed without schema validation', () => {
    const n: ParameterDef[] = [{ name: 'n', type: 'number', min: 10, max: 5 }];
    expect(getParameterDefinitions(n, { locale: 'ar' })[0]!.definitionError).toBe('إعدادات المعامل غير صالحة: الحد الأدنى ١٠ أكبر من الحد الأقصى ٥');
    expect(validateParameterValues(n, { n: 7 }).errors[0]!.rule).toBe('bounds');
    const t: ParameterDef[] = [{ name: 't', type: 'datetime', min: 'now', max: '2026-01-01T00:00' }];
    expect(validateParameterValues(t, { t: '2026-06-01T00:00:00Z' }, { now: lateUtc }).errors[0]!.rule).toBe('bounds');
  });
});
