import { describe, it, expect } from 'vitest';
import { validateReport } from '../schema/report-schema.js';
import { interpret } from './interpreter.js';

const schema = (formatOptions?: Record<string, unknown>) => ({
  version: '1', id: 'h', meta: { name: 'H', locale: 'ar', dir: 'rtl' },
  dataset: { adapter: 'static', source: 't' }, fields: [{ name: 'd', type: 'date' }],
  bands: { detail: { height: 7, elements: [{ id: 'e', kind: 'field', field: 'd', format: 'date:hijri', ...(formatOptions ? { formatOptions } : {}), pos: { x: 0, y: 0, w: 80, h: 6 } }] } },
});

function texts(s: unknown): string[] {
  const r = validateReport(s);
  if (!r.ok) throw new Error(r.error);
  const out: string[] = [];
  JSON.stringify(interpret({ schema: r.value, rows: [{ d: '2026-10-15' }] }), (k, v) => {
    if (k === 'text' && typeof v === 'string') out.push(v);
    return v;
  });
  return out;
}

describe('field format date:hijri + formatOptions', () => {
  const d = new Date(2026, 9, 15, 12);
  const fmt = (dateStyle: 'full' | 'medium') => new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { dateStyle }).format(d);
  it('defaults to dateStyle medium', () => expect(texts(schema())).toContain(fmt('medium')));
  it('keeps and honours formatOptions.dateStyle', () => expect(texts(schema({ dateStyle: 'full' }))).toContain(fmt('full')));
  it('rejects an unknown dateStyle', () => expect(validateReport(schema({ dateStyle: 'huge' })).ok).toBe(false));
});
