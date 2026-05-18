import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';
import { exportPdf } from '../exporters/pdf.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

function schemaWithWatermark(wm: unknown): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'wm',
    meta: { name: 'Q1 Report', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
    watermark: wm,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('watermark rendering', () => {
  it('interpreter forwards literal text watermark to render tree', () => {
    const tree = interpret({
      schema: schemaWithWatermark({ kind: 'text', text: 'CONFIDENTIAL' }),
      rows: [{ x: 1 }],
    });
    expect(tree.watermark?.kind).toBe('text');
    if (tree.watermark?.kind === 'text') {
      expect(tree.watermark.text).toBe('CONFIDENTIAL');
    }
  });

  it('interpreter evaluates expression watermark using report context', () => {
    const tree = interpret({
      schema: schemaWithWatermark({
        kind: 'text',
        text: 'DRAFT',
        expression: '"DRAFT — Q1 — " + 2026',
      }),
      rows: [{ x: 1 }],
    });
    expect(tree.watermark?.kind).toBe('text');
    if (tree.watermark?.kind === 'text') {
      expect(tree.watermark.text).toContain('Q1');
      expect(tree.watermark.text).toContain('2026');
    }
  });

  it('HTML renderer emits watermark overlay markup', () => {
    const tree = interpret({
      schema: schemaWithWatermark({ kind: 'text', text: 'CONFIDENTIAL', opacity: 0.2, rotation: -30 }),
      rows: [{ x: 1 }],
    });
    const html = renderHtml(tree).html;
    expect(html).toContain('rw-watermark');
    expect(html).toContain('CONFIDENTIAL');
    expect(html).toMatch(/rotate\(-30deg\)/);
    expect(html).toMatch(/opacity:\s*0\.2/);
  });

  it('HTML renderer emits image watermark with src', () => {
    const tree = interpret({
      schema: schemaWithWatermark({ kind: 'image', src: 'https://example.com/logo.png' }),
      rows: [{ x: 1 }],
    });
    const html = renderHtml(tree).html;
    expect(html).toContain('rw-watermark');
    expect(html).toContain('https://example.com/logo.png');
  });

  it('PDF exporter produces a valid blob when a watermark is present', async () => {
    const blob = await exportPdf({
      schema: schemaWithWatermark({ kind: 'text', text: 'CONFIDENTIAL' }),
      rows: [{ x: 1 }, { x: 2 }, { x: 3 }],
    });
    expect(blob.size).toBeGreaterThan(900);
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer(), 0, 4));
    expect(head).toBe('%PDF');
  });

  it('Tree without watermark does not produce overlay markup', () => {
    const tree = interpret({
      schema: schemaWithWatermark(undefined),
      rows: [{ x: 1 }],
    });
    expect(tree.watermark).toBeUndefined();
    const html = renderHtml(tree).html;
    expect(html).not.toContain('rw-watermark');
  });

  it('escapes watermark text in HTML to prevent injection', () => {
    const tree = interpret({
      schema: schemaWithWatermark({ kind: 'text', text: '<script>alert(1)</script>' }),
      rows: [{ x: 1 }],
    });
    const html = renderHtml(tree).html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
