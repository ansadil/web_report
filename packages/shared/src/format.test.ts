import { describe, it, expect } from 'vitest';
import { formatNumber, formatDate, applyPattern, escapeHtml } from './format.js';

describe('formatNumber', () => {
  it('formats integers in English', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
  it('returns empty for non-finite', () => {
    expect(formatNumber(Infinity, 'en')).toBe('');
    expect(formatNumber(NaN, 'en')).toBe('');
  });
  it('formats currency', () => {
    const out = formatNumber(99.5, 'en', { style: 'currency', currency: 'USD' });
    expect(out).toContain('99');
  });
});

describe('formatDate', () => {
  it('formats a Date', () => {
    const s = formatDate(new Date('2026-05-11T00:00:00Z'), 'en');
    expect(s.length).toBeGreaterThan(0);
  });
  it('returns empty for invalid date', () => {
    expect(formatDate('not-a-date' as unknown as string, 'en')).toBe('');
  });
});

describe('applyPattern', () => {
  it('applies decimal2 pattern', () => {
    expect(applyPattern(3.1, 'decimal2', 'en')).toBe('3.10');
  });
  it('applies integer pattern', () => {
    expect(applyPattern(3.9, 'integer', 'en')).toBe('4');
  });
  it('handles null gracefully', () => {
    expect(applyPattern(null, 'integer', 'en')).toBe('');
  });
  it('passes through strings without pattern', () => {
    expect(applyPattern('hello', undefined, 'en')).toBe('hello');
  });
  it('formats Date without pattern as datetime', () => {
    const s = applyPattern(new Date('2024-06-15T14:30:00Z'), undefined, 'en');
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain('2024-06-15T14:30:00');
  });
});

describe('escapeHtml', () => {
  it('escapes the five core entities', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});
