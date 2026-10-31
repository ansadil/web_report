import type { ReportSchemaV1 } from '@reports-web/core';

export interface SampleReport {
  readonly id: string;
  readonly name: { en: string; ar: string };
  readonly description: { en: string; ar: string };
  readonly dataset: string;
  build(): ReportSchemaV1;
}

const salesByRegion: SampleReport = {
  id: 'sales-by-region',
  name: { en: 'Monthly Sales', ar: 'تقرير المبيعات الشهري' },
  description: { en: 'Arabic monthly sales layout with a logo, QR code, and group totals.', ar: 'تقرير المبيعات الشهري مع شعار ورمز QR وإجماليات المجموعة.' },
  dataset: 'sales',
  build: () => ({
    version: '1',
    id: 'sales-by-region',
    meta: { name: 'تقرير المبيعات الشهري', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'rest-json', source: 'sales' },
    fields: [
      { name: 'region', type: 'string', label: 'المنطقة' },
      { name: 'product', type: 'string', label: 'الصنف' },
      { name: 'qty', type: 'number', label: 'الكمية' },
      { name: 'unitPrice', type: 'number', label: 'السعر' },
      { name: 'amount', type: 'number', label: 'الإجمالي' },
      { name: 'date', type: 'date', label: 'التاريخ' },
    ],
    groups: [
      {
        key: 'region',
        footer: {
          height: 8,
          elements: [
            { id: 'gf1', kind: 'text', value: 'الإجمالي', style: { bold: true, color: '#be3a5a' }, pos: { x: 0, y: 1, w: 70, h: 6 } },
            { id: 'gf2', kind: 'aggregate', fn: 'sum', field: 'qty', scope: 'group', format: 'integer', style: { bold: true, align: 'center' }, pos: { x: 70, y: 1, w: 30, h: 6 } },
            { id: 'gf3', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'group', format: 'decimal2', style: { bold: true, align: 'center' }, pos: { x: 130, y: 1, w: 50, h: 6 } },
          ],
        },
      },
    ],
    bands: {
      reportHeader: {
        height: 24,
        elements: [
          { id: 'logo', kind: 'image', src: 'logo', alt: 'الشعار', pos: { x: 2, y: 3, w: 26, h: 18 } },
          { id: 'title', kind: 'text', value: 'تقرير المبيعات الشهري', style: { bold: true, fontSize: 18, align: 'center', color: '#15233a', font: 'Cairo' }, pos: { x: 32, y: 3, w: 112, h: 10 } },
          { id: 'sub', kind: 'field', field: 'date', style: { align: 'center', fontSize: 11, color: '#1d5a9e', font: 'Cairo' }, pos: { x: 32, y: 14, w: 112, h: 7 } },
          { id: 'qr', kind: 'qr', value: 'https://example.sa/sales', pos: { x: 156, y: 3, w: 18, h: 18 } },
        ],
      },
      pageHeader: {
        height: 10,
        elements: [
          { id: 'ph1', kind: 'text', value: 'الصنف', style: { bold: true, color: '#ffffff', background: '#0f8a7c', font: 'Cairo' }, pos: { x: 0, y: 2, w: 70, h: 6 } },
          { id: 'ph2', kind: 'text', value: 'الكمية', style: { bold: true, align: 'center', color: '#ffffff', background: '#0f8a7c', font: 'Cairo' }, pos: { x: 70, y: 2, w: 30, h: 6 } },
          { id: 'ph3', kind: 'text', value: 'السعر', style: { bold: true, align: 'center', color: '#ffffff', background: '#0f8a7c', font: 'Cairo' }, pos: { x: 100, y: 2, w: 30, h: 6 } },
          { id: 'ph4', kind: 'text', value: 'الإجمالي', style: { bold: true, align: 'center', color: '#ffffff', background: '#0f8a7c', font: 'Cairo' }, pos: { x: 130, y: 2, w: 50, h: 6 } },
        ],
      },
      detail: {
        height: 8,
        elements: [
          { id: 'd1', kind: 'field', field: 'product', style: { font: 'Cairo', color: '#1d5a9e' }, pos: { x: 0, y: 1, w: 70, h: 6 } },
          { id: 'd2', kind: 'field', field: 'qty', format: 'integer', style: { align: 'center', font: 'Cairo', color: '#1d5a9e' }, pos: { x: 70, y: 1, w: 30, h: 6 } },
          { id: 'd3', kind: 'field', field: 'unitPrice', format: 'decimal2', style: { align: 'center', font: 'Cairo', color: '#1d5a9e' }, pos: { x: 100, y: 1, w: 30, h: 6 } },
          {
            id: 'd4', kind: 'field', field: 'amount', format: 'decimal2', style: { align: 'center', font: 'Cairo', color: '#1d5a9e' },
            cond: [{ when: 'amount >= 500', style: { color: '#16a34a', bold: true } }],
            pos: { x: 130, y: 1, w: 50, h: 6 },
          },
        ],
      },
      pageFooter: {
        height: 8,
        elements: [
          { id: 'pf1', kind: 'text', value: 'صفحة {page} من {pages}', style: { font: 'Cairo', fontSize: 9 }, pos: { x: 2, y: 1, w: 80, h: 5 } },
          { id: 'pf2', kind: 'text', value: 'أُنشئ بواسطة web_report', style: { color: '#7a8699', align: 'end', fontSize: 9, font: 'Cairo' }, pos: { x: 90, y: 1, w: 90, h: 5 } },
        ],
      },
      reportFooter: {
        height: 70,
        elements: [
          { id: 'rf0', kind: 'line', orientation: 'horizontal', thickness: 0.5, pos: { x: 0, y: 0, w: 180, h: 0.5 } },
          { id: 'rf1', kind: 'text', value: 'الإجمالي الكلي', style: { bold: true, fontSize: 12, align: 'end', font: 'Cairo' }, pos: { x: 60, y: 3, w: 70, h: 6 } },
          { id: 'rf2', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'report', format: 'decimal2', style: { bold: true, fontSize: 12, align: 'end', background: '#dbeafe', color: '#1e40af' }, pos: { x: 130, y: 3, w: 50, h: 6 } },
          { id: 'rf5', kind: 'chart', type: 'bar', labelsField: 'region', valueField: 'amount', title: 'المبيعات حسب المنطقة', pos: { x: 0, y: 20, w: 180, h: 45 } },
        ],
      },
    },
  }),
};

const employeesByDept: SampleReport = {
  id: 'employees-by-dept',
  name: { en: 'Employees by Department', ar: 'الموظفون حسب القسم' },
  description: { en: 'Grouped report with salary aggregations and conditional formatting.', ar: 'تقرير مُجَمَّع مع تجميعات الرواتب وتنسيق شرطي.' },
  dataset: 'employees',
  build: () => ({
    version: '1',
    id: 'employees-by-dept',
    meta: { name: 'Employees by Department', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'employees' },
    fields: [
      { name: 'id', type: 'number', label: 'ID' },
      { name: 'name', type: 'string', label: 'Name' },
      { name: 'department', type: 'string', label: 'Department' },
      { name: 'position', type: 'string', label: 'Position' },
      { name: 'salary', type: 'number', label: 'Salary' },
      { name: 'joinDate', type: 'date', label: 'Join Date' },
    ],
    groups: [
      {
        key: 'department',
        header: {
          height: 8,
          elements: [{ id: 'gh1', kind: 'field', field: 'department', style: { bold: true, fontSize: 12, background: '#fef3c7', color: '#92400e' }, pos: { x: 0, y: 1, w: 180, h: 6 } }],
        },
        footer: {
          height: 8,
          elements: [
            { id: 'gf1', kind: 'text', value: 'Count:', style: { italic: true, align: 'end' }, pos: { x: 90, y: 1, w: 25, h: 5 } },
            { id: 'gf2', kind: 'aggregate', fn: 'count', field: 'id', scope: 'group', style: { bold: true }, pos: { x: 116, y: 1, w: 14, h: 5 } },
            { id: 'gf3', kind: 'aggregate', fn: 'sum', field: 'salary', scope: 'group', format: 'decimal2', style: { bold: true, align: 'end', color: '#92400e' }, pos: { x: 130, y: 1, w: 50, h: 5 } },
          ],
        },
      },
    ],
    bands: {
      reportHeader: {
        height: 14,
        elements: [
          { id: 'rh1', kind: 'text', value: 'Employees Roster', style: { bold: true, fontSize: 16, align: 'center' }, pos: { x: 0, y: 2, w: 180, h: 8 } },
        ],
      },
      pageHeader: {
        height: 10,
        elements: [
          { id: 'ph1', kind: 'text', value: 'ID', style: { bold: true, background: '#f1f5f9' }, pos: { x: 0, y: 2, w: 16, h: 6 } },
          { id: 'ph2', kind: 'text', value: 'Name', style: { bold: true, background: '#f1f5f9' }, pos: { x: 16, y: 2, w: 60, h: 6 } },
          { id: 'ph3', kind: 'text', value: 'Position', style: { bold: true, background: '#f1f5f9' }, pos: { x: 76, y: 2, w: 50, h: 6 } },
          { id: 'ph4', kind: 'text', value: 'Join Date', style: { bold: true, background: '#f1f5f9' }, pos: { x: 126, y: 2, w: 24, h: 6 } },
          { id: 'ph5', kind: 'text', value: 'Salary', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 150, y: 2, w: 30, h: 6 } },
        ],
      },
      detail: {
        height: 6,
        elements: [
          { id: 'd1', kind: 'field', field: 'id', format: 'integer', pos: { x: 0, y: 0, w: 16, h: 5 } },
          { id: 'd2', kind: 'field', field: 'name', pos: { x: 16, y: 0, w: 60, h: 5 } },
          { id: 'd3', kind: 'field', field: 'position', pos: { x: 76, y: 0, w: 50, h: 5 } },
          { id: 'd4', kind: 'field', field: 'joinDate', format: 'date:short', style: { fontSize: 9 }, pos: { x: 126, y: 0, w: 24, h: 5 } },
          {
            id: 'd5', kind: 'field', field: 'salary', format: 'decimal2', style: { align: 'end' },
            cond: [
              { when: 'salary >= 20000', style: { color: '#15803d', bold: true } },
              { when: 'salary < 12000', style: { color: '#b91c1c' } },
            ],
            pos: { x: 150, y: 0, w: 30, h: 5 },
          },
        ],
      },
      reportFooter: {
        height: 14,
        elements: [
          { id: 'rf0', kind: 'line', orientation: 'horizontal', thickness: 0.5, pos: { x: 0, y: 0, w: 180, h: 0.5 } },
          { id: 'rf1', kind: 'text', value: 'TOTAL PAYROLL', style: { bold: true, fontSize: 12, align: 'end' }, pos: { x: 60, y: 3, w: 70, h: 6 } },
          { id: 'rf2', kind: 'aggregate', fn: 'sum', field: 'salary', scope: 'report', format: 'decimal2', style: { bold: true, fontSize: 12, align: 'end', background: '#dcfce7', color: '#166534' }, pos: { x: 130, y: 3, w: 50, h: 6 } },
        ],
      },
    },
  }),
};

const invoicesSummary: SampleReport = {
  id: 'invoices-summary',
  name: { en: 'Invoices Summary', ar: 'ملخص الفواتير' },
  description: { en: 'Plain tabular report with conditional status colors.', ar: 'تقرير جدولي بسيط مع ألوان شرطية للحالة.' },
  dataset: 'invoices',
  build: () => ({
    version: '1',
    id: 'invoices-summary',
    meta: { name: 'Invoices Summary', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'landscape', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'invoices' },
    fields: [
      { name: 'invoiceNo', type: 'string', label: 'Invoice #' },
      { name: 'customer', type: 'string', label: 'Customer' },
      { name: 'items', type: 'number', label: 'Items' },
      { name: 'subtotal', type: 'number', label: 'Subtotal' },
      { name: 'vat', type: 'number', label: 'VAT' },
      { name: 'total', type: 'number', label: 'Total' },
      { name: 'status', type: 'string', label: 'Status' },
      { name: 'date', type: 'date', label: 'Date' },
    ],
    groups: [],
    bands: {
      reportHeader: {
        height: 14,
        elements: [
          { id: 'rh1', kind: 'text', value: 'Invoices — Q1 2026', style: { bold: true, fontSize: 16, align: 'center' }, pos: { x: 0, y: 2, w: 267, h: 8 } },
        ],
      },
      pageHeader: {
        height: 10,
        elements: [
          { id: 'ph1', kind: 'text', value: 'Invoice #', style: { bold: true, background: '#f1f5f9' }, pos: { x: 0, y: 2, w: 32, h: 6 } },
          { id: 'ph2', kind: 'text', value: 'Customer', style: { bold: true, background: '#f1f5f9' }, pos: { x: 32, y: 2, w: 50, h: 6 } },
          { id: 'ph3', kind: 'text', value: 'Date', style: { bold: true, background: '#f1f5f9' }, pos: { x: 82, y: 2, w: 26, h: 6 } },
          { id: 'ph4', kind: 'text', value: 'Items', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 108, y: 2, w: 18, h: 6 } },
          { id: 'ph5', kind: 'text', value: 'Subtotal', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 126, y: 2, w: 35, h: 6 } },
          { id: 'ph6', kind: 'text', value: 'VAT', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 161, y: 2, w: 25, h: 6 } },
          { id: 'ph7', kind: 'text', value: 'Total', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 186, y: 2, w: 35, h: 6 } },
          { id: 'ph8', kind: 'text', value: 'Status', style: { bold: true, align: 'center', background: '#f1f5f9' }, pos: { x: 221, y: 2, w: 46, h: 6 } },
        ],
      },
      detail: {
        height: 7,
        elements: [
          { id: 'd1', kind: 'field', field: 'invoiceNo', style: { fontSize: 9 }, pos: { x: 0, y: 0, w: 32, h: 5 } },
          { id: 'd2', kind: 'field', field: 'customer', pos: { x: 32, y: 0, w: 50, h: 5 } },
          { id: 'd3', kind: 'field', field: 'date', format: 'date:short', style: { fontSize: 9 }, pos: { x: 82, y: 0, w: 26, h: 5 } },
          { id: 'd4', kind: 'field', field: 'items', format: 'integer', style: { align: 'end' }, pos: { x: 108, y: 0, w: 18, h: 5 } },
          { id: 'd5', kind: 'field', field: 'subtotal', format: 'decimal2', style: { align: 'end' }, pos: { x: 126, y: 0, w: 35, h: 5 } },
          { id: 'd6', kind: 'field', field: 'vat', format: 'decimal2', style: { align: 'end' }, pos: { x: 161, y: 0, w: 25, h: 5 } },
          { id: 'd7', kind: 'field', field: 'total', format: 'decimal2', style: { align: 'end', bold: true }, pos: { x: 186, y: 0, w: 35, h: 5 } },
          {
            id: 'd8', kind: 'field', field: 'status', style: { align: 'center', bold: true, fontSize: 9 },
            cond: [
              { when: 'status == "paid"', style: { color: '#15803d', background: '#dcfce7' } },
              { when: 'status == "pending"', style: { color: '#a16207', background: '#fef3c7' } },
              { when: 'status == "overdue"', style: { color: '#b91c1c', background: '#fee2e2' } },
            ],
            pos: { x: 221, y: 0, w: 46, h: 5 },
          },
        ],
      },
      reportFooter: {
        height: 60,
        elements: [
          { id: 'rf0', kind: 'line', orientation: 'horizontal', thickness: 0.5, pos: { x: 0, y: 0, w: 267, h: 0.5 } },
          { id: 'rf1', kind: 'text', value: 'TOTALS', style: { bold: true, fontSize: 12, align: 'end' }, pos: { x: 82, y: 3, w: 44, h: 6 } },
          { id: 'rf2', kind: 'aggregate', fn: 'sum', field: 'subtotal', scope: 'report', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 126, y: 3, w: 35, h: 6 } },
          { id: 'rf3', kind: 'aggregate', fn: 'sum', field: 'vat', scope: 'report', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 161, y: 3, w: 25, h: 6 } },
          { id: 'rf4', kind: 'aggregate', fn: 'sum', field: 'total', scope: 'report', format: 'decimal2', style: { bold: true, align: 'end', background: '#dbeafe', color: '#1e40af', fontSize: 12 }, pos: { x: 186, y: 3, w: 35, h: 6 } },
          { id: 'rf5', kind: 'chart', type: 'pie', labelsField: 'customer', valueField: 'total', title: 'Revenue by Customer', pos: { x: 0, y: 12, w: 267, h: 40 } },
        ],
      },
    },
  }),
};

const expressionDemo: SampleReport = {
  id: 'expression-demo',
  name: { en: 'Expression Demo', ar: 'عرض التعبيرات' },
  description: { en: 'Showcases computed fields with the safe expression evaluator.', ar: 'يستعرض الحقول المحسوبة باستخدام مُقيِّم التعبيرات الآمن.' },
  dataset: 'sales',
  build: () => ({
    version: '1',
    id: 'expression-demo',
    meta: { name: 'Expression Demo — Discounts & Tax', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'landscape', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'sales' },
    fields: [
      { name: 'region', type: 'string', label: 'Region' },
      { name: 'product', type: 'string', label: 'Product' },
      { name: 'qty', type: 'number', label: 'Qty' },
      { name: 'unitPrice', type: 'number', label: 'Unit Price' },
      { name: 'amount', type: 'number', label: 'Amount' },
      { name: 'date', type: 'date', label: 'Date' },
    ],
    groups: [],
    bands: {
      reportHeader: {
        height: 14,
        elements: [
          { id: 'rh1', kind: 'text', value: 'Sales with Computed Discounts & VAT', style: { bold: true, fontSize: 16, align: 'center' }, pos: { x: 0, y: 2, w: 267, h: 8 } },
          { id: 'rh2', kind: 'text', value: 'Discount: 10% if amount >= 500 else 5%. VAT: 5%.', style: { italic: true, color: '#64748b', align: 'center', fontSize: 9 }, pos: { x: 0, y: 10, w: 267, h: 4 } },
        ],
      },
      pageHeader: {
        height: 10,
        elements: [
          { id: 'ph1', kind: 'text', value: 'Region', style: { bold: true, background: '#f1f5f9' }, pos: { x: 0, y: 2, w: 30, h: 6 } },
          { id: 'ph2', kind: 'text', value: 'Product', style: { bold: true, background: '#f1f5f9' }, pos: { x: 30, y: 2, w: 40, h: 6 } },
          { id: 'ph3', kind: 'text', value: 'Amount', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 70, y: 2, w: 35, h: 6 } },
          { id: 'ph4', kind: 'text', value: 'Discount %', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 105, y: 2, w: 30, h: 6 } },
          { id: 'ph5', kind: 'text', value: 'After Discount', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 135, y: 2, w: 45, h: 6 } },
          { id: 'ph6', kind: 'text', value: 'VAT (5%)', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 180, y: 2, w: 30, h: 6 } },
          { id: 'ph7', kind: 'text', value: 'Grand Total', style: { bold: true, align: 'end', background: '#f1f5f9' }, pos: { x: 210, y: 2, w: 55, h: 6 } },
        ],
      },
      detail: {
        height: 6,
        elements: [
          { id: 'd1', kind: 'field', field: 'region', pos: { x: 0, y: 0, w: 30, h: 5 } },
          { id: 'd2', kind: 'field', field: 'product', pos: { x: 30, y: 0, w: 40, h: 5 } },
          { id: 'd3', kind: 'field', field: 'amount', format: 'decimal2', style: { align: 'end' }, pos: { x: 70, y: 0, w: 35, h: 5 } },
          { id: 'd4', kind: 'expr', expression: 'amount >= 500 ? 10 : 5', format: 'percent', style: { align: 'end', color: '#0891b2' }, pos: { x: 105, y: 0, w: 30, h: 5 } },
          { id: 'd5', kind: 'expr', expression: 'amount - (amount * (amount >= 500 ? 0.10 : 0.05))', format: 'decimal2', style: { align: 'end' }, pos: { x: 135, y: 0, w: 45, h: 5 } },
          { id: 'd6', kind: 'expr', expression: '(amount - (amount * (amount >= 500 ? 0.10 : 0.05))) * 0.05', format: 'decimal2', style: { align: 'end', color: '#64748b' }, pos: { x: 180, y: 0, w: 30, h: 5 } },
          { id: 'd7', kind: 'expr', expression: '(amount - (amount * (amount >= 500 ? 0.10 : 0.05))) * 1.05', format: 'decimal2', style: { align: 'end', bold: true, color: '#1e40af' }, pos: { x: 210, y: 0, w: 55, h: 5 } },
        ],
      },
      reportFooter: {
        height: 10,
        elements: [
          { id: 'rf0', kind: 'line', orientation: 'horizontal', thickness: 0.5, pos: { x: 0, y: 0, w: 267, h: 0.5 } },
          { id: 'rf1', kind: 'text', value: 'Sum of original amounts:', style: { italic: true, align: 'end' }, pos: { x: 0, y: 3, w: 105, h: 5 } },
          { id: 'rf2', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'report', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 110, y: 3, w: 50, h: 5 } },
        ],
      },
    },
  }),
};

export const SAMPLE_REPORTS: readonly SampleReport[] = [
  salesByRegion,
  employeesByDept,
  invoicesSummary,
  expressionDemo,
];

export function getSampleReport(id: string): SampleReport {
  const r = SAMPLE_REPORTS.find((x) => x.id === id);
  if (!r) throw new Error(`Sample report not found: ${id}`);
  return r;
}
