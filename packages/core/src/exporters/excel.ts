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

type Field = ReportSchemaV1['fields'][number];
type Band = ReportSchemaV1['bands']['detail'];

/** Excel number format for a shared `applyPattern` pattern (null → leave General). */
export function excelNumFmt(pattern: string | undefined, type: Field['type'] | undefined): string | null {
  switch (pattern) {
    case 'integer':
      return '#,##0';
    case 'decimal2':
      return '#,##0.00';
    case 'percent':
      return '0%';
    case 'date:short':
      return 'dd/mm/yyyy';
    case 'date':
    case 'date:long':
    case 'date:hijri':
      return 'dd mmm yyyy';
    case 'datetime':
      return 'dd/mm/yyyy hh:mm';
    default:
      break;
  }
  if (pattern?.startsWith('currency:')) {
    const code = pattern.slice('currency:'.length) || 'USD';
    return `#,##0.00 "${code.replace(/"/g, '')}"`;
  }
  if (type === 'date') return 'yyyy-mm-dd';
  return null;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Real Excel date for a date-ish value. Excel dates have no time zone, so ISO strings without
 * an offset keep their wall-clock fields (stored as UTC, which is how exceljs serialises).
 */
export function toExcelDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);
  if (typeof v !== 'string') return null;
  const m = ISO_DATE_RE.exec(v.trim());
  if (!m) return null;
  if (m[7]) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** First `format` used for `field` by a field/aggregate element of the given bands. */
function formatFor(field: string, kind: 'field' | 'aggregate', bands: readonly (Band | undefined)[]): string | undefined {
  for (const band of bands) {
    for (const el of band?.elements ?? []) {
      if (el.kind === kind && (el as { field?: string }).field === field) {
        const f = (el as { format?: string }).format;
        if (f) return f;
      }
    }
  }
  return undefined;
}

export async function exportExcel({ schema, rows }: ExcelExportInput): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Reports Web';
  wb.created = new Date();
  const isAr = schema.meta.locale === 'ar';
  const dir = schema.meta.dir ?? (isAr ? 'rtl' : 'ltr');
  const ws = wb.addWorksheet(schema.meta.name.slice(0, 31) || 'Report', {
    views: [{ rightToLeft: dir === 'rtl' }],
  });
  const totalLabel = isAr ? 'الإجمالي' : 'Total';

  if (schema.meta.name) {
    ws.addRow([schema.meta.name]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow([]);
  }
  const headers = schema.fields.map((f) => f.label ?? f.name);
  if (headers.length > 0) {
    const r = ws.addRow(headers);
    r.font = { bold: true };
    r.alignment = { horizontal: dir === 'rtl' ? 'right' : 'left' };
  }
  const fields = schema.fields;
  const fieldNames = fields.map((f) => f.name);
  const isDateField = (f: Field): boolean => f.type === 'date';
  /** Column number (1-based) of each field: data, group totals and report totals all share it. */
  const colOf = (field: string): number => fieldNames.indexOf(field) + 1;
  const detailFmt = fields.map((f) => excelNumFmt(formatFor(f.name, 'field', [schema.bands.detail]), f.type));
  const primaryGroup = schema.groups[0];

  const writeGroup = (groupRowsSubset: readonly Row[]) => {
    for (const row of groupRowsSubset) {
      const values = fields.map((f) => {
        const v = row[f.name];
        if (v == null) return null;
        if (isDateField(f)) return toExcelDate(v) ?? v;
        return v;
      });
      const r = ws.addRow(values);
      detailFmt.forEach((fmt, i) => {
        const cell = r.getCell(i + 1);
        if (fmt && (typeof cell.value === 'number' || cell.value instanceof Date)) cell.numFmt = fmt;
      });
    }
  };

  /** A totals row: label in the first column not used by a value, values under their field. */
  const writeTotals = (label: string, values: readonly { field: string; value: unknown; format?: string; integer?: boolean }[]) => {
    const r = ws.addRow([]);
    r.font = { bold: true };
    const used = new Set<number>();
    for (const v of values) {
      const c = colOf(v.field);
      if (c < 1) continue;
      used.add(c);
      const cell = r.getCell(c);
      cell.value = (v.value ?? 0) as ExcelJS.CellValue;
      const fmt = v.format ?? formatFor(v.field, 'field', [schema.bands.detail]);
      cell.numFmt = (fmt?.startsWith('date') ? null : excelNumFmt(fmt, undefined)) ?? (v.integer ? '#,##0' : '#,##0.00');
    }
    let labelCol = 1;
    while (used.has(labelCol)) labelCol++;
    r.getCell(labelCol).value = label;
    return r;
  };

  if (primaryGroup) {
    const groups = groupRows(rows as Row[], primaryGroup.key);
    for (const g of groups) {
      const gHeader = ws.addRow([`${primaryGroup.key}: ${String(g.key ?? '')}`]);
      gHeader.font = { bold: true, italic: true };
      writeGroup(g.rows);
      const groupAggs = (primaryGroup.footer?.elements ?? []).filter((e) => e.kind === 'aggregate') as {
        fn: AggregateRequest['fn'];
        field: string;
        format?: string;
      }[];
      if (groupAggs.length > 0) {
        const reqs: AggregateRequest[] = groupAggs.map((a) => ({ key: `${a.fn}_${a.field}`, fn: a.fn, field: a.field }));
        const map = computeAggregates(g.rows, reqs);
        writeTotals(
          `${totalLabel} (${String(g.key ?? '')})`,
          groupAggs.map((a) => ({ field: a.field, value: map[`${a.fn}_${a.field}`], integer: a.fn === 'count', ...(a.format ? { format: a.format } : {}) })),
        );
      }
    }
  } else {
    writeGroup(rows);
  }

  const aggs = collectAggregates(schema);
  if (aggs.length > 0) {
    const map = computeAggregates(rows, aggs);
    ws.addRow([]);
    const bands = [schema.bands.reportFooter, schema.bands.reportHeader, schema.bands.detail];
    writeTotals(
      totalLabel,
      aggs.map((a) => {
        const fmt = formatFor(a.field, 'aggregate', bands);
        return { field: a.field, value: map[a.key], integer: a.fn === 'count', ...(fmt ? { format: fmt } : {}) };
      }),
    );
  }

  fields.forEach((f, i) => {
    ws.getColumn(i + 1).width = isDateField(f) ? 14 : 16;
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
