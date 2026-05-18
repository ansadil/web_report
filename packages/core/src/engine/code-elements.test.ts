import { describe, it, expect } from 'vitest';
import { validateReport } from '../schema/report-schema.js';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';

describe('qr and barcode elements', () => {
  it('validates schema with qr and barcode elements', () => {
    const r = validateReport({
      version: '1',
      id: 'codes',
      meta: { name: 'Codes', locale: 'en', dir: 'ltr' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 'rows' },
      fields: [{ name: 'sku', type: 'string' }],
      bands: {
        detail: {
          height: 40,
          elements: [
            { id: 'q1', kind: 'qr', value: 'HELLO', pos: { x: 5, y: 5, w: 24, h: 24 } },
            { id: 'b1', kind: 'barcode', field: 'sku', symbology: 'CODE128', pos: { x: 40, y: 8, w: 50, h: 14 } },
          ],
        },
      },
    });
    expect(r.ok).toBe(true);
  });

  it('interprets and renders code placeholders for viewer hydration', () => {
    const schema = validateReport({
      version: '1',
      id: 'codes',
      meta: { name: 'Codes', locale: 'en', dir: 'ltr' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 'rows' },
      fields: [{ name: 'sku', type: 'string' }],
      bands: {
        detail: {
          height: 40,
          elements: [
            {
              id: 'q1',
              kind: 'qr',
              value: 'HELLO',
              style: { color: '#2563eb', background: '#f8fafc' },
              pos: { x: 5, y: 5, w: 24, h: 24 },
            },
            { id: 'b1', kind: 'barcode', field: 'sku', symbology: 'CODE128', pos: { x: 40, y: 8, w: 50, h: 14 } },
          ],
        },
      },
    });
    if (!schema.ok) throw new Error(schema.error);
    const tree = interpret({ schema: schema.value, rows: [{ sku: '123456789012' }] });
    const det = tree.sections.find((s) => s.band === 'detail');
    expect(det?.elements.some((e) => e.kind === 'qr' && e.code?.payload === 'HELLO')).toBe(true);
    expect(det?.elements.some((e) => e.kind === 'barcode' && e.code?.payload === '123456789012')).toBe(true);

    const { html, codeIds } = renderHtml(tree, { idPrefix: 't' });
    expect(html).toContain('rw-qr');
    expect(html).toContain('rw-barcode');
    expect(html).toContain('data-rw-code');
    expect(html).toContain('#2563eb');
    expect(html).toContain('#f8fafc');
    expect(codeIds).toHaveLength(2);
  });
});
