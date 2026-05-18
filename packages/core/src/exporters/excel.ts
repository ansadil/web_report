import ExcelJS from 'exceljs';
import type { Row } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { computeAggregates, groupRows } from '../engine/aggregator.js';
import type { AggregateRequest } from '../engine/aggregator.js';

export interface ExcelExportInput {
  readonly schema: ReportSchemaV1;
  readonly rows: readonly Row[];
}

function collectAggregates(schema: ReportSchemaV1): AggregateRequest[] {
  const out: AggregateRequest[] = [];
  const seen = new Set<string>();
  const visit = (band: ReportSchemaV1['bands']['detail'] | undefined) => {
    if (!band) return;
    for (const el of band.elements) {
      if (el.kind === 'aggregate' && el.scope === 'report') {
        const k = `${el.fn}_${el.field}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ key: k, fn: el.fn, field: el.field });
      }
    }
  };
  visit(schema.bands.reportHeader);
  visit(schema.bands.reportFooter);
  visit(schema.bands.detail);
  return out;
}

export async function exportExcel({ schema, rows }: ExcelExportInput): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Reports Web';
  wb.created = new Date();
  const ws = wb.addWorksheet(schema.meta.name.slice(0, 31) || 'Report', {
    views: [{ rightToLeft: schema.meta.dir === 'rtl' }],
  });

  if (schema.meta.name) {
    ws.addRow([schema.meta.name]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow([]);
  }
  const headers = schema.fields.map((f) => f.label ?? f.name);
  if (headers.length > 0) {
    const r = ws.addRow(headers);
    r.font = { bold: true };
    r.alignment = { horizontal: schema.meta.dir === 'rtl' ? 'right' : 'left' };
  }
  const fieldNames = schema.fields.map((f) => f.name);
  const primaryGroup = schema.groups[0];

  const writeGroup = (groupRowsSubset: readonly Row[]) => {
    for (const row of groupRowsSubset) {
      ws.addRow(fieldNames.map((n) => row[n] ?? null));
    }
  };

  if (primaryGroup) {
    const groups = groupRows(rows as Row[], primaryGroup.key);
    for (const g of groups) {
      const gHeader = ws.addRow([`${primaryGroup.key}: ${String(g.key ?? '')}`]);
      gHeader.font = { bold: true, italic: true };
      writeGroup(g.rows);
      const groupAggs = (primaryGroup.footer?.elements ?? []).filter((e) => e.kind === 'aggregate');
      if (groupAggs.length > 0) {
        const reqs: AggregateRequest[] = groupAggs.map((a) => ({ key: a.field, fn: (a as { fn: AggregateRequest['fn'] }).fn, field: (a as { field: string }).field }));
        const map = computeAggregates(g.rows, reqs);
        ws.addRow([`Σ`, ...fieldNames.map((n) => (map[n] != null ? map[n] : ''))]);
      }
    }
  } else {
    writeGroup(rows);
  }

  const aggs = collectAggregates(schema);
  if (aggs.length > 0) {
    const map = computeAggregates(rows, aggs);
    ws.addRow([]);
    const totalRow = ws.addRow(['TOTAL', ...fieldNames.map(() => '')]);
    totalRow.font = { bold: true };
    for (const a of aggs) {
      const fieldIdx = fieldNames.indexOf(a.field);
      if (fieldIdx >= 0) {
        const cell = totalRow.getCell(fieldIdx + 2);
        cell.value = map[a.key] ?? 0;
        cell.numFmt = '#,##0.00';
      }
    }
  }

  fieldNames.forEach((_n, i) => {
    const col = ws.getColumn(i + 2);
    col.width = 16;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportCsv({ schema, rows }: ExcelExportInput): Blob {
  const sep = ',';
  const lines: string[] = [];
  const headers = schema.fields.map((f) => f.label ?? f.name);
  const fieldNames = schema.fields.map((f) => f.name);
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  lines.push(headers.map(escape).join(sep));
  for (const row of rows) {
    lines.push(fieldNames.map((n) => escape(row[n])).join(sep));
  }
  return new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}
