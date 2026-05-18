import { describe, it, expect } from 'vitest';
import { validateReport } from './report-schema.js';

const minimal = {
  version: '1',
  id: 'r1',
  meta: { name: 'Test', locale: 'en', dir: 'ltr' },
  dataset: { adapter: 'static', source: 'rows' },
  fields: [],
  bands: { detail: { height: 8, elements: [] } },
};

describe('WatermarkSchema', () => {
  it('accepts a missing watermark (backward-compat)', () => {
    expect(validateReport(minimal).ok).toBe(true);
  });

  it('accepts a text watermark with literal text', () => {
    const r = validateReport({
      ...minimal,
      watermark: { kind: 'text', text: 'CONFIDENTIAL' },
    });
    expect(r.ok).toBe(true);
  });

  it('accepts a text watermark with an expression', () => {
    const r = validateReport({
      ...minimal,
      watermark: { kind: 'text', text: 'DRAFT', expression: '"DRAFT — " + meta.name' },
    });
    expect(r.ok).toBe(true);
  });

  it('accepts an image watermark', () => {
    const r = validateReport({
      ...minimal,
      watermark: { kind: 'image', src: 'https://example.com/logo.png', opacity: 0.1, rotation: 0, width: 100 },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects unknown watermark kind', () => {
    const r = validateReport({
      ...minimal,
      watermark: { kind: 'video', src: 'x' },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects opacity > 1', () => {
    const r = validateReport({
      ...minimal,
      watermark: { kind: 'text', text: 'X', opacity: 1.5 },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects rotation outside [-180, 180]', () => {
    const r = validateReport({
      ...minimal,
      watermark: { kind: 'text', text: 'X', rotation: 200 },
    });
    expect(r.ok).toBe(false);
  });

  it('applies sensible defaults', () => {
    const r = validateReport({
      ...minimal,
      watermark: { kind: 'text', text: 'X' },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.watermark && r.value.watermark.kind === 'text') {
      expect(r.value.watermark.opacity).toBeGreaterThan(0);
      expect(r.value.watermark.opacity).toBeLessThanOrEqual(1);
      expect(r.value.watermark.rotation).toBeDefined();
      expect(r.value.watermark.fontSize).toBeGreaterThan(0);
    }
  });
});
