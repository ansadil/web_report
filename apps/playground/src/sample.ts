import type { ReportSchemaV1 } from '@reports-web/core';
import type { Row } from '@reports-web/shared';

export const sampleRows: Row[] = [
  { region: 'North', product: 'Widget A', qty: 12, unitPrice: 25.5, amount: 306, date: '2026-01-15' },
  { region: 'North', product: 'Widget B', qty: 7, unitPrice: 49.0, amount: 343, date: '2026-01-22' },
  { region: 'South', product: 'Gadget',  qty: 5, unitPrice: 99.0, amount: 495, date: '2026-02-08' },
  { region: 'South', product: 'Widget A', qty: 18, unitPrice: 25.5, amount: 459, date: '2026-02-19' },
  { region: 'West',  product: 'Gadget',  qty: 11, unitPrice: 99.0, amount: 1089, date: '2026-03-04' },
  { region: 'West',  product: 'Widget B', qty: 3, unitPrice: 49.0, amount: 147, date: '2026-03-25' },
  { region: 'East',  product: 'Widget A', qty: 9, unitPrice: 25.5, amount: 229.5, date: '2026-04-11' },
];

export const sampleSchema: ReportSchemaV1 = {
  version: '1',
  id: 'sales-by-region-2026',
  meta: { name: 'Sales by Region (2026)', locale: 'en', dir: 'ltr' },
  page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
  dataset: { adapter: 'static', source: 'sales' },
  fields: [
    { name: 'region', type: 'string', label: 'Region' },
    { name: 'product', type: 'string', label: 'Product' },
    { name: 'qty', type: 'number', label: 'Qty' },
    { name: 'unitPrice', type: 'number', label: 'Unit Price' },
    { name: 'amount', type: 'number', label: 'Amount' },
    { name: 'date', type: 'date', label: 'Date' },
  ],
  groups: [
    {
      key: 'region',
      header: {
        height: 8,
        elements: [
          { id: 'gh1', kind: 'field', field: 'region', style: { bold: true, fontSize: 12, background: '#eef2ff' }, pos: { x: 0, y: 1, w: 180, h: 6 } },
        ],
      },
      footer: {
        height: 6,
        elements: [
          { id: 'gf1', kind: 'text', value: 'Subtotal', style: { italic: true, align: 'end' }, pos: { x: 90, y: 0, w: 30, h: 5 } },
          { id: 'gf2', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'group', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 130, y: 0, w: 50, h: 5 } },
        ],
      },
    },
  ],
  bands: {
    reportHeader: {
      height: 18,
      elements: [
        { id: 'h1', kind: 'text', value: 'Sales by Region — FY 2026', style: { bold: true, fontSize: 16, align: 'center' }, pos: { x: 0, y: 2, w: 180, h: 8 } },
        { id: 'h2', kind: 'text', value: 'Confidential — Internal Use', style: { italic: true, color: '#64748b', align: 'center', fontSize: 9 }, pos: { x: 0, y: 11, w: 180, h: 4 } },
      ],
    },
    pageHeader: {
      height: 8,
      elements: [
        { id: 'ph1', kind: 'text', value: 'Product', style: { bold: true }, pos: { x: 0, y: 1, w: 60, h: 5 } },
        { id: 'ph2', kind: 'text', value: 'Qty', style: { bold: true, align: 'end' }, pos: { x: 60, y: 1, w: 30, h: 5 } },
        { id: 'ph3', kind: 'text', value: 'Unit Price', style: { bold: true, align: 'end' }, pos: { x: 90, y: 1, w: 40, h: 5 } },
        { id: 'ph4', kind: 'text', value: 'Amount', style: { bold: true, align: 'end' }, pos: { x: 130, y: 1, w: 50, h: 5 } },
      ],
    },
    detail: {
      height: 6,
      elements: [
        { id: 'd1', kind: 'field', field: 'product', pos: { x: 0, y: 0, w: 60, h: 5 } },
        { id: 'd2', kind: 'field', field: 'qty', format: 'integer', style: { align: 'end' }, pos: { x: 60, y: 0, w: 30, h: 5 } },
        { id: 'd3', kind: 'field', field: 'unitPrice', format: 'decimal2', style: { align: 'end' }, pos: { x: 90, y: 0, w: 40, h: 5 } },
        { id: 'd4', kind: 'field', field: 'amount', format: 'decimal2', style: { align: 'end' }, pos: { x: 130, y: 0, w: 50, h: 5 } },
      ],
    },
    pageFooter: {
      height: 8,
      elements: [
        { id: 'pf1', kind: 'text', value: 'Reports Web', style: { color: '#94a3b8', align: 'start', fontSize: 9 }, pos: { x: 0, y: 1, w: 90, h: 5 } },
        { id: 'pf2', kind: 'text', value: 'Page {page}', style: { color: '#94a3b8', align: 'end', fontSize: 9 }, pos: { x: 90, y: 1, w: 90, h: 5 } },
      ],
    },
    reportFooter: {
      height: 60,
      elements: [
        { id: 'rf1', kind: 'line', orientation: 'horizontal', thickness: 0.5, pos: { x: 0, y: 0, w: 180, h: 0.5 } },
        { id: 'rf2', kind: 'text', value: 'TOTAL', style: { bold: true, fontSize: 12, align: 'end' }, pos: { x: 90, y: 2, w: 40, h: 6 } },
        { id: 'rf3', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'report', format: 'decimal2', style: { bold: true, fontSize: 12, align: 'end', background: '#dbeafe' }, pos: { x: 130, y: 2, w: 50, h: 6 } },
        { id: 'rf4', kind: 'chart', type: 'bar', labelsField: 'region', valueField: 'amount', title: 'Sales by Region', pos: { x: 0, y: 12, w: 180, h: 45 } },
      ],
    },
  },
};
