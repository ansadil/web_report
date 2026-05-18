import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { validateReport } from '../schema/report-schema.js';

const baseSchema = {
  version: '1' as const,
  id: 'r1',
  meta: { name: 'Sales', locale: 'en' as const, dir: 'ltr' as const },
  page: { size: 'A4' as const, orientation: 'portrait' as const, margins: { top: 15, right: 15, bottom: 15, left: 15 } },
  dataset: { adapter: 'static', source: 'rows' },
  fields: [
    { name: 'region', type: 'string' as const },
    { name: 'amount', type: 'number' as const },
  ],
  groups: [],
  bands: {
    reportHeader: { height: 10, elements: [{ id: 't1', kind: 'text' as const, value: 'Sales Report', pos: { x: 0, y: 0, w: 180, h: 8 } }] },
    detail: {
      height: 8,
      elements: [
        { id: 'f1', kind: 'field' as const, field: 'region', pos: { x: 0, y: 0, w: 90, h: 6 } },
        { id: 'f2', kind: 'field' as const, field: 'amount', format: 'decimal2', pos: { x: 90, y: 0, w: 90, h: 6 } },
      ],
    },
    reportFooter: {
      height: 10,
      elements: [{ id: 'a1', kind: 'aggregate' as const, fn: 'sum' as const, field: 'amount', scope: 'report' as const, format: 'decimal2', pos: { x: 90, y: 0, w: 90, h: 8 } }],
    },
  },
};

describe('interpret', () => {
  it('produces a section per detail row plus header/footer', () => {
    const v = validateReport(baseSchema);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const rows = [
      { region: 'N', amount: 100 },
      { region: 'S', amount: 50 },
    ];
    const t = interpret({ schema: v.value, rows });
    expect(t.sections.map((s) => s.band)).toEqual(['reportHeader', 'detail', 'detail', 'reportFooter']);
  });

  it('computes report-scope sum aggregate', () => {
    const v = validateReport(baseSchema);
    if (!v.ok) throw new Error('bad schema');
    const rows = [
      { region: 'N', amount: 100 },
      { region: 'N', amount: 200 },
      { region: 'S', amount: 50 },
    ];
    const t = interpret({ schema: v.value, rows });
    const footer = t.sections.find((s) => s.band === 'reportFooter');
    expect(footer?.elements[0]?.text).toBe('350.00');
  });

  it('respects RTL/locale', () => {
    const v = validateReport({ ...baseSchema, meta: { ...baseSchema.meta, locale: 'ar' as const, dir: 'rtl' as const } });
    if (!v.ok) throw new Error('bad schema');
    const t = interpret({ schema: v.value, rows: [{ region: 'N', amount: 100 }] });
    expect(t.dir).toBe('rtl');
    expect(t.locale).toBe('ar');
  });

  it('supports groups (header / footer wrapping)', () => {
    const grouped = {
      ...baseSchema,
      groups: [
        {
          key: 'region',
          header: { height: 6, elements: [{ id: 'g1', kind: 'text' as const, value: 'Region', pos: { x: 0, y: 0, w: 50, h: 5 } }] },
          footer: { height: 6, elements: [{ id: 'gf1', kind: 'aggregate' as const, fn: 'sum' as const, field: 'amount', scope: 'group' as const, format: 'decimal2', pos: { x: 90, y: 0, w: 90, h: 5 } }] },
        },
      ],
    };
    const v = validateReport(grouped);
    if (!v.ok) throw new Error('bad schema');
    const rows = [
      { region: 'N', amount: 100 },
      { region: 'N', amount: 200 },
      { region: 'S', amount: 50 },
    ];
    const t = interpret({ schema: v.value, rows });
    const bands = t.sections.map((s) => s.band);
    expect(bands).toEqual(['reportHeader', 'groupHeader', 'detail', 'detail', 'groupFooter', 'groupHeader', 'detail', 'groupFooter', 'reportFooter']);
    const groupFooters = t.sections.filter((s) => s.band === 'groupFooter');
    expect(groupFooters[0]?.elements[0]?.text).toBe('300.00');
    expect(groupFooters[1]?.elements[0]?.text).toBe('50.00');
  });

  it('honors visibleWhen', () => {
    const schema = {
      ...baseSchema,
      bands: {
        ...baseSchema.bands,
        detail: {
          height: 8,
          elements: [
            { id: 'fb', kind: 'field' as const, field: 'amount', visibleWhen: 'amount > 75', format: 'decimal2', pos: { x: 0, y: 0, w: 50, h: 6 } },
          ],
        },
      },
    };
    const v = validateReport(schema);
    if (!v.ok) throw new Error('bad schema');
    const rows = [{ region: 'N', amount: 50 }, { region: 'N', amount: 100 }];
    const t = interpret({ schema: v.value, rows });
    const details = t.sections.filter((s) => s.band === 'detail');
    expect(details[0]?.elements.length).toBe(0);
    expect(details[1]?.elements.length).toBe(1);
    expect(details[1]?.elements[0]?.text).toBe('100.00');
  });

  it('evaluates expr element', () => {
    const schema = {
      ...baseSchema,
      bands: {
        ...baseSchema.bands,
        detail: {
          height: 8,
          elements: [{ id: 'e1', kind: 'expr' as const, expression: 'amount * 1.15', format: 'decimal2', pos: { x: 0, y: 0, w: 90, h: 6 } }],
        },
      },
    };
    const v = validateReport(schema);
    if (!v.ok) throw new Error('bad schema');
    const t = interpret({ schema: v.value, rows: [{ region: 'N', amount: 100 }] });
    const d = t.sections.find((s) => s.band === 'detail');
    expect(d?.elements[0]?.text).toBe('115.00');
  });

  it('evaluates now() on page footer with printedAt', () => {
    const schema = {
      ...baseSchema,
      bands: {
        ...baseSchema.bands,
        pageFooter: {
          height: 8,
          elements: [
            {
              id: 'printed',
              kind: 'expr' as const,
              expression: 'now()',
              format: 'datetime',
              pos: { x: 0, y: 0, w: 120, h: 6 },
            },
          ],
        },
      },
    };
    const v = validateReport(schema);
    if (!v.ok) throw new Error('bad schema');
    const printedAt = new Date('2024-06-15T14:30:00Z');
    const t = interpret({ schema: v.value, rows: [{ region: 'N', amount: 1 }], printedAt });
    const footer = t.sections.find((s) => s.band === 'pageFooter');
    expect(footer?.elements[0]?.text).toMatch(/2024|Jun|June|١٥/);
  });

  it('exposes meta in expr via vars', () => {
    const schema = {
      ...baseSchema,
      bands: {
        ...baseSchema.bands,
        reportHeader: {
          height: 8,
          elements: [
            {
              id: 'title',
              kind: 'expr' as const,
              expression: 'meta.name',
              pos: { x: 0, y: 0, w: 120, h: 6 },
            },
          ],
        },
      },
    };
    const v = validateReport(schema);
    if (!v.ok) throw new Error('bad schema');
    const t = interpret({ schema: v.value, rows: [] });
    const header = t.sections.find((s) => s.band === 'reportHeader');
    expect(header?.elements[0]?.text).toBe('Sales');
  });
});
