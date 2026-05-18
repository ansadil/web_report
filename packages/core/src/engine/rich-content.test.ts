import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';
import type { ReportSchemaV1 } from '../schema/report-schema.js';

const schema: ReportSchemaV1 = {
  version: '1',
  id: 'r1',
  meta: { name: 'Rich', locale: 'en', dir: 'ltr' },
  page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
  dataset: { adapter: 'static', source: 'rows' },
  fields: [{ name: 'name', type: 'string' }, { name: 'amount', type: 'number' }],
  groups: [],
  bands: {
    detail: {
      height: 30,
      elements: [
        {
          id: 'h1',
          kind: 'richtext',
          mode: 'html',
          content: '<p>Hi <name>, total <amount></p>',
          pos: { x: 0, y: 0, w: 80, h: 12 },
        },
        {
          id: 'm1',
          kind: 'richtext',
          mode: 'markdown',
          content: '## Summary\n\n**<name>**: <amount>',
          format: 'decimal2',
          pos: { x: 0, y: 14, w: 80, h: 14 },
        },
      ],
    },
  },
};

describe('html and markdown elements', () => {
  it('substitutes fields and renders rich HTML', () => {
    const tree = interpret({ schema, rows: [{ name: 'Ada', amount: 42 }] });
    const htmlEl = tree.sections[0]!.elements.find((e) => e.id === 'h1');
    const mdEl = tree.sections[0]!.elements.find((e) => e.id === 'm1');
    expect(htmlEl?.html).toBe('<p>Hi Ada, total 42</p>');
    expect(mdEl?.html).toContain('<h2>Summary</h2>');
    expect(mdEl?.html).toContain('<strong>Ada</strong>');
    expect(mdEl?.html).toContain('42.00');

    const { html } = renderHtml(tree);
    expect(html).toContain('rw-rich');
    expect(html).toContain('Hi Ada');
    expect(html).toContain('<h2>Summary</h2>');
  });
});
