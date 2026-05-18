import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';
import { lineThicknessMm } from './line-layout.js';
import type { ReportSchemaV1 } from '../schema/report-schema.js';

const schema: ReportSchemaV1 = {
  version: '1',
  id: 'line-test',
  meta: { name: 'Line', locale: 'en', dir: 'ltr' },
  page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
  dataset: { adapter: 'static', source: 'rows' },
  fields: [],
  groups: [],
  bands: {
    detail: {
      height: 40,
      elements: [
        {
          id: 'hline',
          kind: 'line',
          orientation: 'horizontal',
          thickness: 2,
          color: '#c00',
          pos: { x: 10, y: 5, w: 80, h: lineThicknessMm(2) },
        },
        {
          id: 'vline',
          kind: 'line',
          orientation: 'vertical',
          thickness: 1,
          pos: { x: 100, y: 5, w: lineThicknessMm(1), h: 30 },
        },
      ],
    },
  },
};

describe('line element rendering', () => {
  it('passes orientation and thickness to render tree', () => {
    const tree = interpret({ schema, rows: [{}] });
    const h = tree.sections[0]!.elements.find((e) => e.id === 'hline');
    const v = tree.sections[0]!.elements.find((e) => e.id === 'vline');
    expect(h?.line).toEqual({ orientation: 'horizontal', thickness: 2, color: '#c00' });
    expect(v?.line?.orientation).toBe('vertical');
    const { html } = renderHtml(tree);
    expect(html).toContain('rw-line-horizontal');
    expect(html).toContain('rw-line-vertical');
    expect(html).toContain('width:100%;height:100%');
  });
});
