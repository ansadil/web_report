import { normalizeLinePos } from './api.js';
import type { ReportElement, ReportSchemaV1, Style } from './api.js';
import { newId } from './ids.js';
import type { ToolKind } from './types.js';

export function emptySchema(): ReportSchemaV1 {
  return {
    version: '1',
    id: newId('report'),
    meta: { name: 'Untitled Report', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    groups: [],
    bands: {
      reportHeader: { height: 18, elements: [] },
      pageHeader: { height: 12, elements: [] },
      detail: { height: 10, elements: [] },
      pageFooter: { height: 10, elements: [] },
      reportFooter: { height: 16, elements: [] },
    },
  };
}

export function defaultStyle(): Style {
  return { fontSize: 10, color: '#111' };
}

export function createElement(kind: ToolKind, x: number, y: number, w: number, h: number, field?: string): ReportElement {
  const id = newId(kind);
  const pos = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), w: Math.max(5, Math.round(w)), h: Math.max(4, Math.round(h)) };
  const style = defaultStyle();
  switch (kind) {
    case 'text':
      return { id, kind, value: 'Text', pos, style };
    case 'field':
      return { id, kind, field: field ?? 'field', pos, style };
    case 'image':
      return { id, kind, src: '', pos, style };
    case 'chart':
      return { id, kind, type: 'bar', labelsField: field ?? 'label', valueField: 'value', pos, style };
    case 'aggregate':
      return { id, kind, fn: 'sum', field: field ?? 'amount', scope: 'report', pos, style };
    case 'expr':
      return { id, kind, expression: 'now()', format: 'datetime', pos, style };
    case 'line': {
      const orientation = 'horizontal';
      const thickness = 1;
      const linePos = normalizeLinePos(orientation, thickness, {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        w: Math.max(20, Math.round(w)),
        h: Math.max(4, Math.round(h)),
      });
      return { id, kind, orientation, thickness, pos: linePos };
    }
    case 'box':
      return { id, kind, pos };
    case 'qr':
      return {
        id,
        kind,
        value: 'https://example.com',
        errorCorrectionLevel: 'M',
        pos: { ...pos, w: Math.max(pos.w, 22), h: Math.max(pos.h, 22) },
      };
    case 'barcode':
      return {
        id,
        kind,
        value: '123456789012',
        symbology: 'CODE128',
        displayValue: true,
        pos: { ...pos, w: Math.max(pos.w, 40), h: Math.max(pos.h, 14) },
      };
    case 'html':
      return {
        id,
        kind: 'richtext',
        mode: 'html',
        content: '<p>Hello <name></p>',
        pos: { ...pos, w: Math.max(pos.w, 50), h: Math.max(pos.h, 18) },
        style,
      };
    case 'markdown':
      return {
        id,
        kind: 'richtext',
        mode: 'markdown',
        content: '# Title\n\nHello <name>',
        pos: { ...pos, w: Math.max(pos.w, 50), h: Math.max(pos.h, 22) },
        style,
      };
    case 'richtext':
      return {
        id,
        kind: 'richtext',
        mode: 'html',
        content: '<p>Hello <name></p>',
        pos: { ...pos, w: Math.max(pos.w, 50), h: Math.max(pos.h, 18) },
        style,
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
