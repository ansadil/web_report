import type { ReportSchemaV1 } from '../schema/report-schema.js';

export interface TemplateInfo {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  build(): ReportSchemaV1;
}

const blankTemplate: TemplateInfo = {
  id: 'blank',
  title: 'Blank',
  description: 'Empty report with default bands.',
  build: () => ({
    version: '1',
    id: `report-${Date.now().toString(36)}`,
    meta: { name: 'Untitled', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    groups: [],
    bands: {
      reportHeader: { height: 18, elements: [] },
      pageHeader: { height: 10, elements: [] },
      detail: { height: 8, elements: [] },
      pageFooter: { height: 8, elements: [] },
      reportFooter: { height: 14, elements: [] },
    },
  }),
};

const tabularTemplate: TemplateInfo = {
  id: 'tabular',
  title: 'Tabular',
  description: 'Header + tabular detail + totals footer.',
  build: () => ({
    version: '1',
    id: `tabular-${Date.now().toString(36)}`,
    meta: { name: 'Tabular Report', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [
      { name: 'name', type: 'string', label: 'Name' },
      { name: 'qty', type: 'number', label: 'Qty' },
      { name: 'total', type: 'number', label: 'Total' },
    ],
    groups: [],
    bands: {
      reportHeader: {
        height: 14,
        elements: [{ id: 'h', kind: 'text', value: 'Report', style: { bold: true, fontSize: 16, align: 'center' }, pos: { x: 0, y: 3, w: 180, h: 8 } }],
      },
      pageHeader: {
        height: 8,
        elements: [
          { id: 'ph1', kind: 'text', value: 'Name', style: { bold: true }, pos: { x: 0, y: 1, w: 90, h: 5 } },
          { id: 'ph2', kind: 'text', value: 'Qty', style: { bold: true, align: 'end' }, pos: { x: 90, y: 1, w: 40, h: 5 } },
          { id: 'ph3', kind: 'text', value: 'Total', style: { bold: true, align: 'end' }, pos: { x: 130, y: 1, w: 50, h: 5 } },
        ],
      },
      detail: {
        height: 6,
        elements: [
          { id: 'd1', kind: 'field', field: 'name', pos: { x: 0, y: 0, w: 90, h: 5 } },
          { id: 'd2', kind: 'field', field: 'qty', format: 'integer', style: { align: 'end' }, pos: { x: 90, y: 0, w: 40, h: 5 } },
          { id: 'd3', kind: 'field', field: 'total', format: 'decimal2', style: { align: 'end' }, pos: { x: 130, y: 0, w: 50, h: 5 } },
        ],
      },
      reportFooter: {
        height: 10,
        elements: [
          { id: 'f1', kind: 'text', value: 'TOTAL', style: { bold: true, align: 'end' }, pos: { x: 90, y: 2, w: 40, h: 5 } },
          { id: 'f2', kind: 'aggregate', fn: 'sum', field: 'total', scope: 'report', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 130, y: 2, w: 50, h: 5 } },
        ],
      },
    },
  }),
};

const groupedTemplate: TemplateInfo = {
  id: 'grouped',
  title: 'Grouped',
  description: 'Tabular report grouped by a category field.',
  build: () => ({
    ...tabularTemplate.build(),
    id: `grouped-${Date.now().toString(36)}`,
    meta: { name: 'Grouped Report', locale: 'en', dir: 'ltr' },
    fields: [
      { name: 'category', type: 'string', label: 'Category' },
      { name: 'name', type: 'string', label: 'Name' },
      { name: 'qty', type: 'number', label: 'Qty' },
      { name: 'total', type: 'number', label: 'Total' },
    ],
    groups: [
      {
        key: 'category',
        header: {
          height: 8,
          elements: [{ id: 'gh', kind: 'field', field: 'category', style: { bold: true, fontSize: 12, background: '#eef2ff' }, pos: { x: 0, y: 1, w: 180, h: 6 } }],
        },
        footer: {
          height: 6,
          elements: [
            { id: 'gf1', kind: 'text', value: 'Subtotal', style: { italic: true, align: 'end' }, pos: { x: 90, y: 0, w: 40, h: 5 } },
            { id: 'gf2', kind: 'aggregate', fn: 'sum', field: 'total', scope: 'group', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 130, y: 0, w: 50, h: 5 } },
          ],
        },
      },
    ],
  }),
};

export const TEMPLATES: ReadonlyArray<TemplateInfo> = [blankTemplate, tabularTemplate, groupedTemplate];

export function getTemplate(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
