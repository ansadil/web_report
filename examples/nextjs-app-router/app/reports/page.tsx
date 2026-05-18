import { ViewerClient } from './ViewerClient';
import type { ReportSchemaV1 } from '@reports-web/core';

async function loadSchema(): Promise<ReportSchemaV1> {
  return {
    version: '1',
    id: 'sales-q1',
    meta: { name: 'Sales Q1', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'rest', source: 'sales' },
    fields: [
      { name: 'region', type: 'string', label: 'Region' },
      { name: 'amount', type: 'number', label: 'Amount' },
    ],
    groups: [],
    bands: {
      reportHeader: { height: 10, elements: [{ id: 'h', kind: 'text', value: 'Sales Q1', style: { bold: true, fontSize: 14 }, pos: { x: 0, y: 0, w: 180, h: 8 } }] },
      detail: {
        height: 6,
        elements: [
          { id: 'd1', kind: 'field', field: 'region', pos: { x: 0, y: 0, w: 90, h: 5 } },
          { id: 'd2', kind: 'field', field: 'amount', format: 'decimal2', style: { align: 'end' }, pos: { x: 90, y: 0, w: 90, h: 5 } },
        ],
      },
      reportFooter: {
        height: 8,
        elements: [{ id: 'f', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'report', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 90, y: 1, w: 90, h: 6 } }],
      },
    },
  };
}

export default async function Page() {
  const schema = await loadSchema();
  return (
    <main style={{ height: '100vh' }}>
      <ViewerClient schema={schema} />
    </main>
  );
}
