import { LitElement, css, html, nothing } from 'lit';
import { property, state, query } from 'lit/decorators.js';
import type { FieldMeta, Row } from '@reports-web/shared';
import { MM_TO_PX } from '@reports-web/shared';
import { resolveDir, resolveLocale } from './direction.js';
import type {
  Element as ReportElement,
  Band,
  ConditionalFormatRule,
  Group,
  ReportSchemaV1,
  Style,
  Watermark,
} from '../schema/report-schema.js';
import { validateReport } from '../schema/report-schema.js';
import { linePosForOrientationChange, lineThicknessMm, normalizeLinePos } from '../engine/line-layout.js';
import { buildReportEvalVars } from '../engine/interpreter.js';
import { tryEvaluate } from '../engine/expression.js';
import { applyPattern } from '@reports-web/shared';
import type { DataAdapter } from '../adapters/data/index.js';
import { createStaticAdapter } from '../adapters/data/index.js';
import type { StorageAdapter } from '../adapters/storage/index.js';
import { t } from '../i18n/strings.js';
import { logger } from '../logging/logger.js';
import { icon, toolIconForKind } from './icons.js';

type BuilderAction = 'save' | 'json' | 'preview';
const BUILDER_DEFAULT_ACTIONS: readonly BuilderAction[] = ['save', 'json'];

type BandKey = 'reportHeader' | 'pageHeader' | 'detail' | 'pageFooter' | 'reportFooter';
const BAND_KEYS: readonly BandKey[] = ['reportHeader', 'pageHeader', 'detail', 'pageFooter', 'reportFooter'];

type ResizeHandleKind = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const RESIZE_HANDLE_KINDS: readonly ResizeHandleKind[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const LINE_RESIZE_HANDLES: Record<'horizontal' | 'vertical', readonly ResizeHandleKind[]> = {
  horizontal: ['e', 'w', 'ne', 'nw', 'se', 'sw'],
  vertical: ['n', 's', 'ne', 'nw', 'se', 'sw'],
};
type SideSectionKey = 'actions' | 'tools' | 'properties';
type RectMm = { x: number; y: number; w: number; h: number };
type MarqueeState = { band: BandKey; start: { x: number; y: number }; current: { x: number; y: number } };
type ContextMenuState = { x: number; y: number; band: BandKey };

type RichToolKind = 'html' | 'markdown';
type ToolKind = ReportElement['kind'] | RichToolKind;
const TOOL_KINDS: ReadonlyArray<{
  kind: ToolKind;
  labelKey: 'text' | 'field' | 'image' | 'chart' | 'aggregate' | 'expression' | 'line' | 'box' | 'qr' | 'barcode' | 'html' | 'markdown';
}> = [
  { kind: 'text', labelKey: 'text' },
  { kind: 'field', labelKey: 'field' },
  { kind: 'html', labelKey: 'html' },
  { kind: 'markdown', labelKey: 'markdown' },
  { kind: 'image', labelKey: 'image' },
  { kind: 'chart', labelKey: 'chart' },
  { kind: 'aggregate', labelKey: 'aggregate' },
  { kind: 'expr', labelKey: 'expression' },
  { kind: 'line', labelKey: 'line' },
  { kind: 'box', labelKey: 'box' },
  { kind: 'qr', labelKey: 'qr' },
  { kind: 'barcode', labelKey: 'barcode' },
];

const PAGE_W_MM = { A4: 210, A5: 148, Letter: 215.9 } as const;
const HISTORY_LIMIT = 100;
const MIN_BUILDER_ZOOM = 0.5;
const MAX_BUILDER_ZOOM = 2;
const BUILDER_ZOOM_STEP = 0.1;

let counter = 0;
function newId(prefix: string): string {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function emptySchema(): ReportSchemaV1 {
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

function defaultStyle(): Style {
  return { fontSize: 10, color: '#111' };
}

function styleBorderToCss(style: Style | undefined, opts: { boxFallback?: boolean } = {}): string {
  const b = style?.border;
  const color = b?.color ?? '#000';
  const parts: string[] = [];
  if (b?.top) parts.push(`border-top:${b.top}pt solid ${color}`);
  if (b?.right) parts.push(`border-right:${b.right}pt solid ${color}`);
  if (b?.bottom) parts.push(`border-bottom:${b.bottom}pt solid ${color}`);
  if (b?.left) parts.push(`border-left:${b.left}pt solid ${color}`);
  if (parts.length > 0) return parts.join(';');
  if (opts.boxFallback) return 'border:1px solid #94a3b8';
  return '';
}

function builderCanvasStyleCss(el: ReportElement): string {
  const parts: string[] = [];
  if (el.style?.padding != null) parts.push(`padding:${el.style.padding}mm`);
  if (el.style?.underline) parts.push('text-decoration:underline');
  const borderCss = styleBorderToCss(el.style, { boxFallback: el.kind === 'box' });
  if (borderCss) parts.push(borderCss);
  return parts.join(';');
}

function createElement(kind: ToolKind, x: number, y: number, w: number, h: number, field?: string): ReportElement {
  const id = newId(kind);
  const pos = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), w: Math.max(5, Math.round(w)), h: Math.max(4, Math.round(h)) };
  const style = defaultStyle();
  switch (kind) {
    case 'text': return { id, kind, value: 'Text', pos, style };
    case 'field': return { id, kind, field: field ?? 'field', pos, style };
    case 'image': return { id, kind, src: '', pos, style };
    case 'chart': return { id, kind, type: 'bar', labelsField: field ?? 'label', valueField: 'value', pos, style };
    case 'aggregate': return { id, kind, fn: 'sum', field: field ?? 'amount', scope: 'report', pos, style };
    case 'expr': return { id, kind, expression: 'now()', format: 'datetime', pos, style };
    case 'line': {
      const orientation = 'horizontal';
      const thickness = 1;
      const pos = normalizeLinePos(orientation, thickness, {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        w: Math.max(20, Math.round(w)),
        h: Math.max(4, Math.round(h)),
      });
      return { id, kind, orientation, thickness, pos };
    }
    case 'box': return { id, kind, pos };
    case 'qr': return { id, kind, value: 'https://example.com', errorCorrectionLevel: 'M', pos: { ...pos, w: Math.max(pos.w, 22), h: Math.max(pos.h, 22) } };
    case 'barcode': return { id, kind, value: '123456789012', symbology: 'CODE128', displayValue: true, pos: { ...pos, w: Math.max(pos.w, 40), h: Math.max(pos.h, 14) } };
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

export class ReportsBuilderElement extends LitElement {
  static override styles = css`
    :host {
      --rb-bg: #f1f5f9;
      --rb-panel: #ffffff;
      --rb-text: #111111;
      --rb-muted: #64748b;
      --rb-border: #e5e7eb;
      --rb-accent: #2563eb;
      --rb-accent-hover: #1d4ed8;
      --rb-canvas-bg: #e2e8f0;
      --rb-tool-bg: #f8fafc;
      --rb-rail: 40px;
      --rb-side-w: 340px;
      --rb-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      display: grid;
      grid-template-columns: var(--rb-side-w) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: 'side center';
      height: 100%;
      min-height: 540px;
      background: var(--rb-bg);
      font-family: var(--rb-font);
      font-size: 13px;
      color: var(--rb-text);
    }
    :host([data-left-collapsed='true']) { --rb-side-w: var(--rb-rail); }
    aside.left {
      grid-area: side;
      background: var(--rb-panel);
      border-inline-end: 1px solid var(--rb-border);
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    aside.left.collapsed .side-body,
    aside.left.collapsed .panel-head .title {
      display: none;
    }
    .panel-head {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--rb-border);
      flex: 0 0 auto;
      min-height: 36px;
      box-sizing: border-box;
    }
    .panel-head .title {
      flex: 1;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--rb-muted);
      letter-spacing: 0.8px;
      font-weight: 600;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .panel-head button.collapse,
    .section-head {
      padding: 4px;
      border: 1px solid transparent;
      background: transparent;
      border-radius: 4px;
      cursor: pointer;
      color: var(--rb-muted);
      display: inline-flex;
      align-items: center;
    }
    .panel-head button.collapse:hover,
    .section-head:hover {
      background: var(--rb-tool-bg);
      color: var(--rb-text);
    }
    .side-body {
      flex: 1 1 auto;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 8px;
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .side-section {
      border: 1px solid var(--rb-border);
      background: var(--rb-panel);
      border-radius: 6px;
      overflow: hidden;
      min-width: 0;
      flex: 0 0 auto;
    }
    .side-section[data-section='properties'] {
      flex: 1 1 auto;
      min-height: 160px;
      display: flex;
      flex-direction: column;
    }
    .section-head {
      width: 100%;
      justify-content: space-between;
      border-radius: 0;
      padding: 7px 8px;
      border-bottom: 1px solid var(--rb-border);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }
    .section-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .section-body {
      padding: 8px;
      min-width: 0;
      box-sizing: border-box;
    }
    .side-section[data-section='properties'] .section-body {
      flex: 1 1 auto;
      overflow-y: auto;
      min-height: 0;
    }
    .toolbar {
      background: var(--rb-panel);
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .toolbar h2 {
      font-size: 14px; margin: 0; flex: 1; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
    }
    .toolbar .sep { width: 1px; height: 22px; background: var(--rb-border); margin: 0 4px; }
    .toolbar input.name {
      padding: 5px 8px; border: 1px solid var(--rb-border); border-radius: 6px;
      font-size: 13px; min-width: 0; width: 100%;
    }
    .toolbar button {
      padding: 5px 10px; border: 1px solid var(--rb-border); background: var(--rb-panel);
      border-radius: 6px; cursor: pointer; color: var(--rb-text);
      display: inline-flex; align-items: center; gap: 6px; line-height: 1; font-size: 13px;
    }
    .toolbar button svg { flex: none; }
    .toolbar button.icon-only { padding: 5px; }
    .toolbar button.primary { background: var(--rb-accent); color: #fff; border-color: var(--rb-accent); }
    .toolbar button:hover { background: var(--rb-tool-bg); }
    .toolbar button.primary:hover { background: var(--rb-accent-hover); }
    .toolbar button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      background: var(--rb-panel);
    }
    .toolbar .customize {
      position: relative;
    }
    .toolbar .menu {
      position: absolute; top: calc(100% + 4px); inset-inline-end: 0;
      background: var(--rb-panel); border: 1px solid var(--rb-border); border-radius: 6px;
      padding: 6px; min-width: 180px; box-shadow: 0 6px 24px rgba(0,0,0,0.08);
      display: grid; gap: 2px; z-index: 50;
    }
    .toolbar .menu label {
      display: flex; align-items: center; gap: 6px; padding: 4px 6px;
      border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    .toolbar .menu label:hover { background: var(--rb-tool-bg); }
    .zoom-tools {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      padding: 2px;
      background: var(--rb-tool-bg);
    }
    .toolbar .zoom-tools button {
      padding: 4px;
      border-color: transparent;
      background: transparent;
    }
    .zoom-value {
      min-width: 46px;
      padding: 0 4px;
      border: 0;
      background: transparent;
      color: var(--rb-text);
      font-size: 12px;
      text-align: center;
      cursor: pointer;
    }
    .doc-name {
      display: grid;
      gap: 4px;
      min-width: 0;
      margin-bottom: 8px;
    }
    .doc-name label {
      font-size: 11px;
      color: var(--rb-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    main.center { grid-area: center; padding: 16px; overflow: auto; background: var(--rb-canvas-bg); min-width: 0; min-height: 0; }
    .panel-title { font-size: 11px; text-transform: uppercase; color: #64748b; margin: 0 0 8px; letter-spacing: 0.5px; }
    .tool-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 4px;
    }
    .tool {
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 1;
      min-height: 34px;
      padding: 4px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      cursor: grab;
      user-select: none;
      color: #334155;
    }
    .tool svg {
      width: 18px;
      height: 18px;
      flex: none;
    }
    .tool:hover {
      background: var(--rb-tool-bg);
      border-color: #cbd5e1;
    }
    .tool:active { cursor: grabbing; }
    .field-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 8px; border-radius: 6px; cursor: grab;
      background: #f8fafc; margin-bottom: 4px; user-select: none;
    }
    .field-row .type { color: #64748b; font-size: 11px; }
    .canvas {
      width: 100%; margin: 0 auto; background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }
    .canvas-zoom {
      margin: 0 auto;
      position: relative;
    }
    .canvas-zoom .canvas {
      margin: 0;
    }
    .band {
      border-bottom: 1px dashed #cbd5e1;
      position: relative;
      background-image: linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px);
      background-size: 20px 20px;
      box-sizing: border-box;
    }
    .band-label {
      position: absolute;
      top: 2px;
      inset-inline-start: 2px;
      font-size: 10px;
      color: #94a3b8;
      background: rgba(255,255,255,0.7);
      padding: 0 4px;
      border-radius: 3px;
      pointer-events: none;
    }
    .band-drop-on { background-color: rgba(37,99,235,0.06); }
    .marquee {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid #2563eb;
      background: rgba(37,99,235,0.12);
      pointer-events: none;
      z-index: 3;
    }
    .element {
      position: absolute;
      box-sizing: border-box;
      border: none;
      outline: 1px dashed transparent;
      outline-offset: 0;
      padding: 2px;
      cursor: move;
      overflow: hidden;
      font-size: 11px;
      background: rgba(255,255,255,0.6);
    }
    .element:hover:not(.selected) { outline-color: #94a3b8; }
    .element.selected {
      outline: 2px solid #2563eb;
      box-shadow: 0 0 0 2px rgba(37,99,235,0.2);
    }
    .element.selected { overflow: visible; }
    .element.richtext {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .element.richtext .element-preview {
      flex: 1;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-word;
      pointer-events: none;
    }
    .element.richtext.selected {
      overflow: visible;
    }
    .element.line {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: rgba(255, 255, 255, 0.35);
    }
    .element.line .kind,
    .element.line > div:not(.line-stroke):not(.resize-handles) {
      display: none;
    }
    .element.line .line-stroke {
      width: 100%;
      height: 100%;
      flex: none;
      pointer-events: none;
    }
    .element .kind { color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
    .resize-handles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
    }
    .resize-handle {
      position: absolute;
      width: 8px;
      height: 8px;
      margin: -4px;
      background: #2563eb;
      border: 1px solid #fff;
      border-radius: 1px;
      pointer-events: auto;
      box-sizing: border-box;
      opacity: 0;
      touch-action: none;
    }
    .element.selected .resize-handle { opacity: 1; }
    .ctx-menu {
      position: fixed;
      z-index: 200;
      min-width: 196px;
      padding: 4px;
      margin: 0;
      list-style: none;
      background: var(--rb-panel);
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.14);
    }
    .ctx-menu button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 8px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--rb-text);
      font: inherit;
      font-size: 12px;
      text-align: start;
      cursor: pointer;
    }
    .ctx-menu button svg {
      flex: none;
      width: 16px;
      height: 16px;
      color: var(--rb-muted);
    }
    .ctx-menu button:hover:not(:disabled) {
      background: var(--rb-tool-bg);
    }
    .ctx-menu button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .ctx-menu .ctx-sep {
      height: 1px;
      margin: 4px 6px;
      background: var(--rb-border);
    }
    .resize-n {
      inset-inline-start: 50%;
      top: -4px;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    .resize-s {
      inset-inline-start: 50%;
      bottom: -4px;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    .resize-e {
      inset-inline-end: -4px;
      inset-block-start: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
    .resize-w {
      inset-inline-start: -4px;
      inset-block-start: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
    .resize-ne {
      inset-inline-end: -4px;
      top: -4px;
      cursor: nesw-resize;
    }
    .resize-nw {
      inset-inline-start: -4px;
      top: -4px;
      cursor: nwse-resize;
    }
    .resize-se {
      inset-inline-end: -4px;
      bottom: -4px;
      cursor: nwse-resize;
    }
    .resize-sw {
      inset-inline-start: -4px;
      bottom: -4px;
      cursor: nesw-resize;
    }
    form.props {
      display: grid;
      gap: 8px;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    form.props label { display: grid; gap: 4px; font-size: 11px; color: #475569; min-width: 0; }
    form.props input, form.props select, form.props textarea {
      padding: 4px 6px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    form.props textarea {
      min-height: 120px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    form.props .hint {
      margin: 0;
      font-size: 11px;
      color: #64748b;
      line-height: 1.35;
    }
    form.props .field-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    form.props .field-chips .chip {
      padding: 2px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #f8fafc;
      font-size: 11px;
      cursor: pointer;
    }
    form.props .field-chips .chip:hover {
      background: #e2e8f0;
    }
    form.props input[type='checkbox'],
    form.props input[type='color'] {
      width: auto;
      max-width: none;
      justify-self: start;
    }
    form.props label:has(input[type='checkbox']) {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 8px;
      flex-wrap: wrap;
    }
    form.props label:has(input[type='checkbox']) input[type='checkbox'] {
      margin-top: 2px;
      flex: none;
    }
    form.props .grid2,
    form.props .grid4 {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      min-width: 0;
    }
    form.props button.danger {
      background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; padding: 6px;
      border-radius: 4px; cursor: pointer;
    }
    form.props button.secondary {
      background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 4px 8px;
      border-radius: 4px; cursor: pointer; font-size: 11px;
    }
    .empty-hint { color: #94a3b8; text-align: center; padding: 16px; font-style: italic; }
    .group {
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 8px;
      background: var(--rb-tool-bg);
      min-width: 0;
      box-sizing: border-box;
    }
    .group > h4 {
      font-size: 11px;
      text-transform: uppercase;
      color: var(--rb-muted);
      letter-spacing: 0.5px;
      margin: 0 0 8px;
      font-weight: 600;
    }
    .cond-rule {
      background: #fff;
      border: 1px solid var(--rb-border);
      border-radius: 4px;
      padding: 6px;
      margin-bottom: 6px;
      display: grid;
      gap: 4px;
    }
    .cond-rule .row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }
    .cond-rule input { flex: 1 1 120px; min-width: 0; max-width: 100%; }
    .sub-panel {
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 8px;
      background: rgba(255,255,255,0.65);
      min-width: 0;
      box-sizing: border-box;
    }
    .sub-panel h5 {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--rb-text);
    }
    .nested-band {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed var(--rb-border);
    }
    .nested-band h6 {
      margin: 0 0 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--rb-muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    form.props .band-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  `;

  @property({ attribute: false }) schema: ReportSchemaV1 | null = null;
  @property({ attribute: false }) dataAdapter: DataAdapter | null = null;
  @property({ attribute: false }) storageAdapter: StorageAdapter | null = null;
  @property({ attribute: false }) sampleRows: readonly Row[] | null = null;
  /** UI language override. When unset, follows the template's meta.locale. */
  @property({ type: String }) locale: 'ar' | 'en' | undefined = undefined;
  /** UI chrome direction override. The canvas always follows the template's meta.dir. */
  @property({ type: String, reflect: true }) override dir: 'rtl' | 'ltr' | '' = '';

  private get _uiLocale(): 'ar' | 'en' {
    return resolveLocale(this.locale, this._schema.meta);
  }

  private get _uiDir(): 'rtl' | 'ltr' {
    return resolveDir(this.dir, null, this._uiLocale);
  }

  /** Direction of the report canvas: always the template's own. */
  private get _canvasDir(): 'rtl' | 'ltr' {
    return this._schema.meta.dir;
  }

  @property({ attribute: false }) actions: readonly BuilderAction[] = BUILDER_DEFAULT_ACTIONS;

  @state() private _schema: ReportSchemaV1 = emptySchema();
  @state() private _selectedIds: ReadonlySet<string> = new Set();
  @state() private _selectedBand: BandKey | null = null;
  /** Anchor for Shift+click range selection (element id). */
  @state() private _selectionAnchorId: string | null = null;
  @state() private _fields: readonly FieldMeta[] = [];
  @state() private _hoverBand: BandKey | null = null;
  @state() private _marquee: MarqueeState | null = null;
  @state() private _leftCollapsed = false;
  @state() private _menuOpen = false;
  @state() private _historyVersion = 0;
  @state() private _zoom = 1;
  @state() private _collapsedSections: Record<SideSectionKey, boolean> = {
    actions: false,
    tools: false,
    properties: false,
  };
  @state() private _contextMenu: ContextMenuState | null = null;

  private _undoStack: ReportSchemaV1[] = [];
  private _redoStack: ReportSchemaV1[] = [];
  private _elementClipboard: { band: BandKey; elements: ReportElement[]; pasteCount: number } | null = null;

  @query('.canvas') private _canvas!: HTMLDivElement;

  private readonly _onDocPointerDown = (ev: PointerEvent): void => {
    if (ev.button === 2) return;
    if (!this._contextMenu) return;
    const menu = this.shadowRoot?.querySelector('.ctx-menu');
    if (menu && ev.composedPath().includes(menu)) return;
    this._closeContextMenu();
  };

  /** Block the browser context menu on the builder; keep it for form fields in the side panel. */
  private readonly _onHostContextMenu = (ev: Event): void => {
    const path = ev.composedPath();
    if (
      path.some(
        (n) =>
          n instanceof HTMLInputElement ||
          n instanceof HTMLTextAreaElement ||
          n instanceof HTMLSelectElement,
      )
    ) {
      return;
    }
    ev.preventDefault();
  };

  private readonly _onKeyDown = (ev: KeyboardEvent): void => {
    const key = ev.key.toLowerCase();
    const isModifier = ev.ctrlKey || ev.metaKey;
    if (this._isEditableKeyboardTarget(ev)) return;
    if (isModifier && !ev.altKey && key === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) this._redo();
      else this._undo();
    } else if (isModifier && !ev.altKey && key === 'y') {
      ev.preventDefault();
      this._redo();
    } else if (isModifier && !ev.altKey && key === 'c') {
      if (!this._copySelectedElements()) return;
      ev.preventDefault();
    } else if (isModifier && !ev.altKey && key === 'x') {
      if (!this._cutSelectedElements()) return;
      ev.preventDefault();
    } else if (isModifier && !ev.altKey && key === 'v') {
      if (!this._pasteElements()) return;
      ev.preventDefault();
    } else if (!isModifier && !ev.altKey && this._nudgeSelectedByArrowKey(ev)) {
      ev.preventDefault();
    } else if (!isModifier && !ev.altKey && key === 'delete') {
      if (this._selectedIds.size === 0) return;
      ev.preventDefault();
      this._deleteSelected();
    } else if (!isModifier && !ev.altKey && key === 'escape') {
      if (this._contextMenu) {
        ev.preventDefault();
        this._closeContextMenu();
        return;
      }
      if (this._selectedIds.size === 0) return;
      ev.preventDefault();
      this._clearSelection();
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this._onKeyDown);
    this.addEventListener('contextmenu', this._onHostContextMenu, true);
    document.addEventListener('pointerdown', this._onDocPointerDown, true);
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (this.schema) this._replaceSchema(structuredClone(this.schema), { resetHistory: true });
    void this._loadFields();
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeyDown);
    this.removeEventListener('contextmenu', this._onHostContextMenu, true);
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    super.disconnectedCallback();
  }

  override updated(changed: Map<PropertyKey, unknown>): void {
    let schemaChanged = false;
    if (changed.has('schema') && this.schema) {
      const v = validateReport(this.schema);
      if (v.ok) {
        this._replaceSchema(v.value, { resetHistory: true });
        schemaChanged = true;
      } else {
        logger.error('reports-builder', 'invalid initial schema', { error: v.error });
      }
    }
    if (changed.has('dataAdapter') || schemaChanged) void this._loadFields();
    if (changed.has('_leftCollapsed')) this.setAttribute('data-left-collapsed', String(this._leftCollapsed));
  }

  private _touchHistory(): void {
    this._historyVersion++;
  }

  private _pushUndoCheckpoint(): void {
    this._undoStack = [...this._undoStack, structuredClone(this._schema)].slice(-HISTORY_LIMIT);
    this._redoStack = [];
    this._touchHistory();
  }

  private _schemaWithNormalizedLines(schema: ReportSchemaV1): ReportSchemaV1 {
    const bands = { ...schema.bands } as typeof schema.bands;
    for (const key of BAND_KEYS) {
      const b = bands[key];
      if (!b) continue;
      bands[key] = {
        ...b,
        elements: b.elements.map((e) => {
          if (e.kind !== 'line') return e;
          return { ...e, pos: this._clampLinePos(key, e, e.pos) };
        }),
      };
    }
    return { ...schema, bands };
  }

  private _replaceSchema(next: ReportSchemaV1, opts: { resetHistory?: boolean } = {}): void {
    this._schema = this._schemaWithNormalizedLines(next);
    if (opts.resetHistory) {
      this._undoStack = [];
      this._redoStack = [];
      this._touchHistory();
    }
  }

  private _setSchema(next: ReportSchemaV1, opts: { history?: boolean } = {}): void {
    if (opts.history !== false) this._pushUndoCheckpoint();
    this._schema = next;
  }

  private _isEditableKeyboardTarget(ev: KeyboardEvent): boolean {
    const target = ev.composedPath()[0];
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
  }

  private _undo(): void {
    const prev = this._undoStack.at(-1);
    if (!prev) return;
    this._undoStack = this._undoStack.slice(0, -1);
    this._redoStack = [...this._redoStack, structuredClone(this._schema)].slice(-HISTORY_LIMIT);
    this._clearSelection();
    this._replaceSchema(structuredClone(prev));
    this._touchHistory();
  }

  private _redo(): void {
    const next = this._redoStack.at(-1);
    if (!next) return;
    this._redoStack = this._redoStack.slice(0, -1);
    this._undoStack = [...this._undoStack, structuredClone(this._schema)].slice(-HISTORY_LIMIT);
    this._clearSelection();
    this._replaceSchema(structuredClone(next));
    this._touchHistory();
  }

  private async _loadFields(): Promise<void> {
    if (this._schema.fields.length > 0) {
      this._fields = this._schema.fields.map((f) => ({ name: f.name, type: f.type, label: f.label }));
      return;
    }
    const adapter = this.dataAdapter ?? (this.sampleRows ? createStaticAdapter({ tables: { [this._schema.dataset.source]: this.sampleRows.slice() } }) : null);
    if (!adapter || !adapter.introspect) return;
    try {
      const fields = await adapter.introspect({ source: this._schema.dataset.source });
      this._fields = fields;
      this._replaceSchema({ ...this._schema, fields: fields.map((f) => ({ name: f.name, type: f.type, label: f.label })) });
    } catch (e) {
      logger.warn('reports-builder', 'introspect failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  private _onToolDragStart(ev: DragEvent, kind: ToolKind): void {
    ev.dataTransfer?.setData('application/x-rw-tool', JSON.stringify({ kind }));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }

  private _onFieldDragStart(ev: DragEvent, field: FieldMeta): void {
    ev.dataTransfer?.setData('application/x-rw-field', JSON.stringify({ name: field.name, type: field.type }));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }

  private _onBandDragOver(ev: DragEvent, band: BandKey): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    this._hoverBand = band;
  }

  private _onBandDragLeave(): void {
    this._hoverBand = null;
  }

  private _bandPixelHeight(b: Band | undefined): number {
    return Math.max(20, (b?.height ?? 10) * MM_TO_PX);
  }

  private _pageContentWidthMm(): number {
    const base = PAGE_W_MM[this._schema.page.size];
    const w = this._schema.page.orientation === 'landscape' ? { A4: 297, A5: 210, Letter: 279.4 }[this._schema.page.size] : base;
    return w - this._schema.page.margins.left - this._schema.page.margins.right;
  }

  private _scalePxToMm(px: number): number {
    return px / this._zoom / MM_TO_PX;
  }

  private _pointInBand(ev: PointerEvent | DragEvent, target: HTMLElement, band: BandKey): { x: number; y: number } {
    const rect = target.getBoundingClientRect();
    const isRtl = this._canvasDir === 'rtl';
    const xPx = isRtl ? rect.right - ev.clientX : ev.clientX - rect.left;
    const yPx = ev.clientY - rect.top;
    const x = Math.min(this._pageContentWidthMm(), Math.max(0, this._scalePxToMm(xPx)));
    const y = Math.min(this._bandInnerHeightMm(band), Math.max(0, this._scalePxToMm(yPx)));
    return { x, y };
  }

  private _canvasHeightPx(): number {
    return BAND_KEYS.reduce((sum, key) => sum + this._bandPixelHeight(this._schema.bands[key]), 0);
  }

  private _bandInnerHeightMm(band: BandKey): number {
    return this._schema.bands[band]?.height ?? 0;
  }

  private _previewExprText(el: Extract<ReportElement, { kind: 'expr' }>): string {
    const vars = buildReportEvalVars(this._schema, this.sampleRows ?? [], new Date());
    const r = tryEvaluate(el.expression, { vars });
    if (!r.ok) return `=${el.expression}`;
    return applyPattern(r.value, el.format, this._schema.meta.locale);
  }

  private _clampLinePos(
    band: BandKey,
    el: Extract<ReportElement, { kind: 'line' }>,
    pos: { x: number; y: number; w: number; h: number },
  ): { x: number; y: number; w: number; h: number } {
    const cross = Math.max(0.1, lineThicknessMm(el.thickness ?? 1));
    const normalized = normalizeLinePos(el.orientation, el.thickness ?? 1, pos);
    const mins =
      el.orientation === 'horizontal'
        ? { minW: 5, minH: cross }
        : { minW: cross, minH: 5 };
    return this._clampElementPos(band, normalized, mins);
  }

  /** Keep element rectangles inside the band (width = page content width, height = band height). */
  private _clampElementPos(
    band: BandKey,
    pos: { x: number; y: number; w: number; h: number },
    mins: { minW?: number; minH?: number } = {},
  ): { x: number; y: number; w: number; h: number } {
    const minW = mins.minW ?? 5;
    const minH = mins.minH ?? 4;
    const maxW = this._pageContentWidthMm();
    const maxH = this._bandInnerHeightMm(band);
    let w = Math.max(minW, Math.round(pos.w * 100) / 100);
    let h = Math.max(minH, Math.round(pos.h * 100) / 100);
    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    if (w > maxW) w = Math.max(minW, maxW);
    if (h > maxH) h = Math.max(minH, maxH);
    x = Math.max(0, x);
    y = Math.max(0, y);
    if (x + w > maxW) x = Math.max(0, maxW - w);
    if (y + h > maxH) y = Math.max(0, maxH - h);
    return { x, y, w, h };
  }

  /** After page size/margins or band height changes, keep every root-band element inside bounds. */
  private _reclampAllRootBandElements(): void {
    const bands = { ...this._schema.bands } as typeof this._schema.bands;
    for (const key of BAND_KEYS) {
      const b = bands[key];
      if (!b) continue;
      bands[key] = {
        ...b,
        elements: b.elements.map((e) => {
          let pos = this._clampElementPos(key, e.pos);
          if (e.kind === 'line') {
            pos = this._clampLinePos(key, e, pos);
          }
          return { ...e, pos };
        }),
      };
    }
    this._setSchema({ ...this._schema, bands }, { history: false });
  }

  private _clearSelection(): void {
    this._selectedIds = new Set();
    this._selectedBand = null;
    this._selectionAnchorId = null;
  }

  private _applyResize(
    start: { x: number; y: number; w: number; h: number },
    band: BandKey,
    dx: number,
    dy: number,
    handle: ResizeHandleKind,
    isRtl: boolean,
  ): { x: number; y: number; w: number; h: number } {
    const rdx = isRtl ? -dx : dx;
    let { x, y, w, h } = start;
    switch (handle) {
      case 'se':
        w += rdx;
        h += dy;
        break;
      case 'e':
        w += rdx;
        break;
      case 's':
        h += dy;
        break;
      case 'sw':
        x += rdx;
        w -= rdx;
        h += dy;
        break;
      case 'w':
        x += rdx;
        w -= rdx;
        break;
      case 'n':
        y += dy;
        h -= dy;
        break;
      case 'ne':
        y += dy;
        h -= dy;
        w += rdx;
        break;
      case 'nw':
        x += rdx;
        w -= rdx;
        y += dy;
        h -= dy;
        break;
      default:
        break;
    }
    return this._clampElementPos(band, { x, y, w, h });
  }

  private _marqueeRect(m: MarqueeState): RectMm {
    const x = Math.min(m.start.x, m.current.x);
    const y = Math.min(m.start.y, m.current.y);
    const w = Math.abs(m.current.x - m.start.x);
    const h = Math.abs(m.current.y - m.start.y);
    return { x, y, w, h };
  }

  private _rectsIntersect(a: RectMm, b: RectMm): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  private _selectElementsInRect(band: BandKey, rect: RectMm): void {
    const elements = this._schema.bands[band]?.elements ?? [];
    const ids = elements.filter((el) => this._rectsIntersect(rect, el.pos)).map((el) => el.id);
    this._selectedBand = ids.length > 0 ? band : null;
    this._selectedIds = new Set(ids);
    this._selectionAnchorId = ids[0] ?? null;
  }

  private _onBandPointerDown(ev: PointerEvent, band: BandKey): void {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture(ev.pointerId);
    const start = this._pointInBand(ev, target, band);
    let moved = false;
    this._marquee = { band, start, current: start };

    const onMove = (e: PointerEvent) => {
      const current = this._pointInBand(e, target, band);
      const next = { band, start, current };
      const rect = this._marqueeRect(next);
      moved = moved || rect.w >= 1 || rect.h >= 1;
      this._marquee = next;
      if (moved) this._selectElementsInRect(band, rect);
    };
    const onUp = (e: PointerEvent) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.releasePointerCapture(e.pointerId);
      const finalRect = this._marquee ? this._marqueeRect(this._marquee) : null;
      this._marquee = null;
      if (moved && finalRect) this._selectElementsInRect(band, finalRect);
      else this._clearSelection();
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp, { once: true });
  }

  private _extendSelectionRange(band: BandKey, id: string): void {
    const els = this._schema.bands[band]?.elements ?? [];
    const ia = this._selectionAnchorId ? els.findIndex((e) => e.id === this._selectionAnchorId) : -1;
    const ib = els.findIndex((e) => e.id === id);
    if (ia < 0 || ib < 0) {
      this._selectedIds = new Set([id]);
      this._selectionAnchorId = id;
      return;
    }
    const lo = Math.min(ia, ib);
    const hi = Math.max(ia, ib);
    const next = new Set<string>();
    for (let i = lo; i <= hi; i++) next.add(els[i]!.id);
    this._selectedIds = next;
  }

  private _onBandDrop(ev: DragEvent, band: BandKey): void {
    ev.preventDefault();
    this._hoverBand = null;
    const dt = ev.dataTransfer;
    if (!dt) return;
    const target = ev.currentTarget as HTMLElement;
    const point = this._pointInBand(ev, target, band);
    const xMm = point.x;
    const yMm = point.y;
    let newEl: ReportElement | null = null;
    const toolRaw = dt.getData('application/x-rw-tool');
    const fieldRaw = dt.getData('application/x-rw-field');
    if (toolRaw) {
      const { kind } = JSON.parse(toolRaw) as { kind: ToolKind };
      newEl = createElement(kind, xMm - 15, yMm - 3, 30, 6);
    } else if (fieldRaw) {
      const { name } = JSON.parse(fieldRaw) as { name: string };
      if (this._selectedBand === band && this._selectedIds.size === 1) {
        const selectedId = [...this._selectedIds][0]!;
        const selected = this._schema.bands[band]?.elements.find((e) => e.id === selectedId);
        if (selected && selected.kind === 'richtext') {
          this._updateElement(band, selectedId, { content: `${selected.content}<${name}>` });
          return;
        }
      }
      newEl = createElement('field', xMm - 20, yMm - 3, 40, 6, name);
    }
    if (!newEl) return;
    newEl = { ...newEl, pos: this._clampElementPos(band, newEl.pos) };
    this._updateBand(band, (b) => ({ ...b, elements: [...b.elements, newEl!] }));
    this._selectedBand = band;
    this._selectedIds = new Set([newEl.id]);
    this._selectionAnchorId = newEl.id;
  }

  private _updateBand(band: BandKey, updater: (b: Band) => Band, opts: { history?: boolean } = {}): void {
    const current = this._schema.bands[band];
    if (!current) return;
    const updated = updater(current);
    this._setSchema({ ...this._schema, bands: { ...this._schema.bands, [band]: updated } }, opts);
  }

  private _updateElement(band: BandKey, id: string, patch: Partial<ReportElement>, opts: { history?: boolean } = {}): void {
    const cur = this._schema.bands[band]?.elements.find((e) => e.id === id);
    let patchFinal = patch;
    if (patch.pos) {
      patchFinal = {
        ...patch,
        pos: this._clampElementPos(band, { ...(cur?.pos ?? { x: 0, y: 0, w: 5, h: 4 }), ...patch.pos }),
      };
    }
    this._updateBand(band, (b) => ({
      ...b,
      elements: b.elements.map((e) => {
        if (e.id !== id) return e;
        let merged = { ...e, ...patchFinal } as ReportElement;
        if (merged.kind === 'line') {
          const nextOrientation =
            'orientation' in patch ? patch.orientation : undefined;
          if (
            cur?.kind === 'line' &&
            nextOrientation &&
            nextOrientation !== cur.orientation
          ) {
            merged = {
              ...merged,
              pos: linePosForOrientationChange(
                cur.orientation,
                nextOrientation,
                merged.thickness ?? 1,
                merged.pos,
              ),
            };
          }
          merged = { ...merged, pos: this._clampLinePos(band, merged, merged.pos) };
        }
        return merged;
      }),
    }), opts);
  }

  private _deleteSelected(): void {
    if (!this._selectedBand || this._selectedIds.size === 0) return;
    const band = this._selectedBand;
    const rm = this._selectedIds;
    this._updateBand(band, (b) => ({ ...b, elements: b.elements.filter((e) => !rm.has(e.id)) }));
    this._clearSelection();
  }

  /** Move selected element(s) by arrow keys (1 mm; 5 mm with Shift). */
  private _nudgeSelectedByArrowKey(ev: KeyboardEvent): boolean {
    let dx = 0;
    let dy = 0;
    switch (ev.key) {
      case 'ArrowUp':
        dy = -1;
        break;
      case 'ArrowDown':
        dy = 1;
        break;
      case 'ArrowLeft':
        dx = this._canvasDir === 'rtl' ? 1 : -1;
        break;
      case 'ArrowRight':
        dx = this._canvasDir === 'rtl' ? -1 : 1;
        break;
      default:
        return false;
    }
    if (!this._selectedBand || this._selectedIds.size === 0) return false;
    const step = ev.shiftKey ? 5 : 1;
    const band = this._selectedBand;
    const ids = this._selectedIds;
    this._updateBand(band, (b) => ({
      ...b,
      elements: b.elements.map((el) => {
        if (!ids.has(el.id)) return el;
        const pos = this._clampElementPos(band, {
          ...el.pos,
          x: el.pos.x + dx * step,
          y: el.pos.y + dy * step,
        });
        return { ...el, pos };
      }),
    }));
    return true;
  }

  private _selectedElements(): ReportElement[] {
    if (!this._selectedBand || this._selectedIds.size === 0) return [];
    const selected = this._selectedIds;
    return (this._schema.bands[this._selectedBand]?.elements ?? []).filter((e) => selected.has(e.id));
  }

  private _copySelectedElements(): boolean {
    if (!this._selectedBand) return false;
    const elements = this._selectedElements();
    if (elements.length === 0) return false;
    this._elementClipboard = {
      band: this._selectedBand,
      elements: structuredClone(elements),
      pasteCount: 0,
    };
    return true;
  }

  private _closeContextMenu(): void {
    if (this._contextMenu) this._contextMenu = null;
  }

  private _openContextMenu(
    x: number,
    y: number,
    band: BandKey,
    opts: { clearSelection?: boolean } = {},
  ): void {
    this._selectedBand = band;
    if (opts.clearSelection) {
      this._selectedIds = new Set();
      this._selectionAnchorId = null;
    }
    this._contextMenu = { x, y, band };
    this.focus();
  }

  private _onBandContextMenu(ev: MouseEvent, band: BandKey): void {
    ev.preventDefault();
    ev.stopPropagation();
    this._openContextMenu(ev.clientX, ev.clientY, band, { clearSelection: true });
  }

  private _onElementContextMenu(ev: MouseEvent, band: BandKey, id: string): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this._selectedBand !== band || !this._selectedIds.has(id)) {
      this._selectedBand = band;
      this._selectedIds = new Set([id]);
      this._selectionAnchorId = id;
    }
    this._openContextMenu(ev.clientX, ev.clientY, band);
  }

  private _cutSelectedElements(): boolean {
    if (!this._copySelectedElements()) return false;
    this._deleteSelected();
    return true;
  }

  private _reorderBandElements(band: BandKey, reorder: (elements: ReportElement[]) => ReportElement[]): void {
    this._updateBand(band, (b) => ({ ...b, elements: reorder([...b.elements]) }));
  }

  private _canBringForward(): boolean {
    if (!this._selectedBand || this._selectedIds.size === 0) return false;
    const els = this._schema.bands[this._selectedBand]?.elements ?? [];
    const sel = this._selectedIds;
    for (let i = els.length - 2; i >= 0; i--) {
      if (sel.has(els[i]!.id) && !sel.has(els[i + 1]!.id)) return true;
    }
    return false;
  }

  private _canSendBackward(): boolean {
    if (!this._selectedBand || this._selectedIds.size === 0) return false;
    const els = this._schema.bands[this._selectedBand]?.elements ?? [];
    const sel = this._selectedIds;
    for (let i = 1; i < els.length; i++) {
      if (sel.has(els[i]!.id) && !sel.has(els[i - 1]!.id)) return true;
    }
    return false;
  }

  private _canBringToFront(): boolean {
    if (!this._selectedBand || this._selectedIds.size === 0) return false;
    const els = this._schema.bands[this._selectedBand]?.elements ?? [];
    const sel = this._selectedIds;
    const picked = els.filter((e) => sel.has(e.id));
    const tail = els.slice(els.length - picked.length);
    return tail.length !== picked.length || tail.some((e, i) => e.id !== picked[i]!.id);
  }

  private _canSendToBack(): boolean {
    if (!this._selectedBand || this._selectedIds.size === 0) return false;
    const els = this._schema.bands[this._selectedBand]?.elements ?? [];
    const sel = this._selectedIds;
    const picked = els.filter((e) => sel.has(e.id));
    const head = els.slice(0, picked.length);
    return head.length !== picked.length || head.some((e, i) => e.id !== picked[i]!.id);
  }

  private _bringToFront(): void {
    if (!this._selectedBand || this._selectedIds.size === 0) return;
    const sel = this._selectedIds;
    this._reorderBandElements(this._selectedBand, (els) => {
      const kept = els.filter((e) => !sel.has(e.id));
      const picked = els.filter((e) => sel.has(e.id));
      return [...kept, ...picked];
    });
  }

  private _sendToBack(): void {
    if (!this._selectedBand || this._selectedIds.size === 0) return;
    const sel = this._selectedIds;
    this._reorderBandElements(this._selectedBand, (els) => {
      const kept = els.filter((e) => !sel.has(e.id));
      const picked = els.filter((e) => sel.has(e.id));
      return [...picked, ...kept];
    });
  }

  private _bringForward(): void {
    if (!this._selectedBand || !this._canBringForward()) return;
    const sel = this._selectedIds;
    this._reorderBandElements(this._selectedBand, (els) => {
      const next = [...els];
      for (let i = next.length - 2; i >= 0; i--) {
        if (sel.has(next[i]!.id) && !sel.has(next[i + 1]!.id)) {
          [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
        }
      }
      return next;
    });
  }

  private _sendBackward(): void {
    if (!this._selectedBand || !this._canSendBackward()) return;
    const sel = this._selectedIds;
    this._reorderBandElements(this._selectedBand, (els) => {
      const next = [...els];
      for (let i = 1; i < next.length; i++) {
        if (sel.has(next[i]!.id) && !sel.has(next[i - 1]!.id)) {
          [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
        }
      }
      return next;
    });
  }

  private _pasteElements(): boolean {
    if (!this._elementClipboard || this._elementClipboard.elements.length === 0) return false;
    const targetBand =
      (this._selectedBand && this._schema.bands[this._selectedBand] ? this._selectedBand : null) ??
      (this._schema.bands[this._elementClipboard.band] ? this._elementClipboard.band : 'detail');
    const band = this._schema.bands[targetBand];
    if (!band) return false;

    const offset = 5 * (this._elementClipboard.pasteCount + 1);
    const pasted = this._elementClipboard.elements.map((src) => {
      const next = structuredClone(src) as ReportElement;
      next.id = newId(next.kind);
      next.pos = this._clampElementPos(targetBand, { ...next.pos, x: next.pos.x + offset, y: next.pos.y + offset });
      if (next.kind === 'line') {
        next.pos = this._clampLinePos(targetBand, next, next.pos);
      }
      return next;
    });

    this._updateBand(targetBand, (b) => ({ ...b, elements: [...b.elements, ...pasted] }));
    this._selectedBand = targetBand;
    this._selectedIds = new Set(pasted.map((e) => e.id));
    this._selectionAnchorId = pasted[0]?.id ?? null;
    this._elementClipboard = { ...this._elementClipboard, pasteCount: this._elementClipboard.pasteCount + 1 };
    return true;
  }

  private _onElementPointerDown(ev: PointerEvent, band: BandKey, id: string, mode: 'move' | ResizeHandleKind): void {
    ev.stopPropagation();
    ev.preventDefault();
    const isRtl = this._canvasDir === 'rtl';

    if (mode !== 'move') {
      if (this._selectedBand !== band || this._selectedIds.size !== 1 || !this._selectedIds.has(id)) {
        this._selectedBand = band;
        this._selectedIds = new Set([id]);
        this._selectionAnchorId = id;
      }
      const target = ev.currentTarget as HTMLElement;
      target.setPointerCapture(ev.pointerId);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const el = this._schema.bands[band]?.elements.find((e) => e.id === id);
      if (!el) return;
      const startPos = { ...el.pos };
      const handle = mode;
      let historyCaptured = false;
      const onMove = (e: PointerEvent) => {
        if (!historyCaptured) {
          this._pushUndoCheckpoint();
          historyCaptured = true;
        }
        const dx = this._scalePxToMm(e.clientX - startX);
        const dy = this._scalePxToMm(e.clientY - startY);
        let next = this._applyResize(startPos, band, dx, dy, handle, isRtl);
        const el = this._schema.bands[band]?.elements.find((e) => e.id === id);
        if (el?.kind === 'line') {
          next = this._clampLinePos(band, el, next);
        }
        this._updateElement(band, id, { pos: next }, { history: false });
      };
      const onUp = (e: PointerEvent) => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.releasePointerCapture(e.pointerId);
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp, { once: true });
      return;
    }

    if (ev.ctrlKey || ev.metaKey) {
      if (this._selectedBand !== band) {
        this._selectedBand = band;
        this._selectedIds = new Set([id]);
        this._selectionAnchorId = id;
        return;
      }
      const next = new Set(this._selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) this._clearSelection();
      else {
        this._selectedIds = next;
        this._selectionAnchorId = id;
      }
      return;
    }

    if (ev.shiftKey && this._selectedBand === band && this._selectionAnchorId) {
      this._extendSelectionRange(band, id);
      return;
    }

    if (!this._selectedIds.has(id) || this._selectedBand !== band) {
      this._selectedBand = band;
      this._selectedIds = new Set([id]);
      this._selectionAnchorId = id;
    }

    const idsToMove = [...this._selectedIds];
    const starts = new Map(idsToMove.map((iid) => {
      const e = this._schema.bands[band]!.elements.find((x) => x.id === iid)!;
      return [iid, { ...e.pos }] as const;
    }));

    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture(ev.pointerId);
    const startX = ev.clientX;
    const startY = ev.clientY;
    let historyCaptured = false;

    const onMove = (e: PointerEvent) => {
      if (!historyCaptured) {
        this._pushUndoCheckpoint();
        historyCaptured = true;
      }
      const dx = this._scalePxToMm(e.clientX - startX);
      const dy = this._scalePxToMm(e.clientY - startY);
      const rdx = isRtl ? -dx : dx;
      this._updateBand(band, (b) => ({
        ...b,
        elements: b.elements.map((el) => {
          const sp = starts.get(el.id);
          if (!sp) return el;
          const nx = sp.x + rdx;
          const ny = sp.y + dy;
          const clamped = this._clampElementPos(band, { ...sp, x: Math.round(nx), y: Math.round(ny) });
          return { ...el, pos: clamped };
        }),
      }), { history: false });
    };
    const onUp = (e: PointerEvent) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.releasePointerCapture(e.pointerId);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp, { once: true });
  }

  private _renderToolboxContent() {
    return html`
      <div class="tool-grid">
        ${TOOL_KINDS.map((tool) => {
          const label = t(this._uiLocale, tool.labelKey);
          return html`
            <div
              class="tool"
              draggable="true"
              title=${label}
              aria-label=${label}
              @dragstart=${(e: DragEvent) => this._onToolDragStart(e, tool.kind)}
            >
              ${toolIconForKind(tool.kind)}
            </div>
          `;
        })}
      </div>
      <h3 class="panel-title" style="margin-top:8px">${t(this._uiLocale, 'fields')}</h3>
      ${this._fields.length === 0
        ? html`<div class="empty-hint">No fields</div>`
        : html`<div>
            ${this._fields.map(
              (f) => html`
                <div class="field-row" draggable="true"
                     @dragstart=${(e: DragEvent) => this._onFieldDragStart(e, f)}>
                  <span>${f.label ?? f.name}</span>
                  <span class="type">${f.type}</span>
                </div>
              `,
            )}
          </div>`}
    `;
  }

  private _renderBand(name: BandKey) {
    const band = this._schema.bands[name];
    if (!band) return nothing;
    const dropClass = this._hoverBand === name ? 'band-drop-on' : '';
    return html`
      <div class="band ${dropClass}"
           style="height:${this._bandPixelHeight(band)}px"
           @dragover=${(e: DragEvent) => this._onBandDragOver(e, name)}
           @dragleave=${this._onBandDragLeave}
           @drop=${(e: DragEvent) => this._onBandDrop(e, name)}
           @contextmenu=${(e: MouseEvent) => this._onBandContextMenu(e, name)}
           @pointerdown=${(e: PointerEvent) => this._onBandPointerDown(e, name)}>
        <span class="band-label">${t(this._uiLocale, name as 'reportHeader')}</span>
        ${band.elements.map((el) => this._renderElement(name, el))}
        ${this._renderMarquee(name)}
      </div>
    `;
  }

  private _renderMarquee(band: BandKey) {
    if (!this._marquee || this._marquee.band !== band) return nothing;
    const r = this._marqueeRect(this._marquee);
    if (r.w < 1 && r.h < 1) return nothing;
    const style = `
      inset-inline-start:${r.x * MM_TO_PX}px;
      top:${r.y * MM_TO_PX}px;
      width:${r.w * MM_TO_PX}px;
      height:${r.h * MM_TO_PX}px;
    `;
    return html`<div class="marquee" style="${style}"></div>`;
  }

  private _renderElement(band: BandKey, el: ReportElement) {
    const isSel = this._selectedIds.has(el.id);
    const showHandles = isSel && this._selectedBand === band && this._selectedIds.size === 1;
    const canvasDecor = builderCanvasStyleCss(el);
    const style = `
      inset-inline-start:${el.pos.x * MM_TO_PX}px;
      top:${el.pos.y * MM_TO_PX}px;
      width:${el.pos.w * MM_TO_PX}px;
      height:${el.pos.h * MM_TO_PX}px;
      font-size:${el.style?.fontSize ?? 10}px;
      color:${el.style?.color ?? '#111'};
      ${el.style?.background && el.kind !== 'line' ? `background:${el.style.background};` : ''}
      ${el.style?.bold ? 'font-weight:700;' : ''}
      ${el.style?.italic ? 'font-style:italic;' : ''}
      ${el.style?.align ? `text-align:${el.style.align === 'end' ? 'right' : el.style.align === 'center' ? 'center' : el.style.align === 'start' ? 'left' : 'justify'};` : ''}
      ${canvasDecor ? `;${canvasDecor}` : ''}
    `;
    if (el.kind === 'line') {
      const lineColor = el.color ?? el.style?.color ?? '#000';
      const strokeStyle = `width:100%;height:100%;background:${lineColor}`;
      const lineHandles = LINE_RESIZE_HANDLES[el.orientation];
      const boxStyle = `
        inset-inline-start:${el.pos.x * MM_TO_PX}px;
        top:${el.pos.y * MM_TO_PX}px;
        width:${el.pos.w * MM_TO_PX}px;
        height:${el.pos.h * MM_TO_PX}px;
      `;
      return html`
        <div
          class="element line ${isSel ? 'selected' : ''}"
          data-orientation=${el.orientation}
          style=${boxStyle}
          @click=${(e: MouseEvent) => e.stopPropagation()}
          @contextmenu=${(e: MouseEvent) => this._onElementContextMenu(e, band, el.id)}
          @pointerdown=${(e: PointerEvent) => {
            if (e.button === 2) {
              e.preventDefault();
              this._onElementContextMenu(e, band, el.id);
              return;
            }
            this._onElementPointerDown(e, band, el.id, 'move');
          }}
        >
          <span class="kind">${el.kind}</span>
          <div class="line-stroke" style=${strokeStyle}></div>
          ${showHandles
            ? html`<div class="resize-handles" aria-hidden="true">
                ${lineHandles.map(
                  (h) =>
                    html`<div
                      class="resize-handle resize-${h}"
                      @pointerdown=${(e: PointerEvent) => {
                        e.stopPropagation();
                        this._onElementPointerDown(e, band, el.id, h);
                      }}
                    ></div>`,
                )}
              </div>`
            : nothing}
        </div>
      `;
    }

    const label = (() => {
      switch (el.kind) {
        case 'text': return el.value;
        case 'field': return `[${el.field}]`;
        case 'aggregate': return `${el.fn}(${el.field})`;
        case 'chart': return `${el.type} chart`;
        case 'expr': return this._previewExprText(el);
        case 'image': return el.src ? '🖼️' : '[image]';
        case 'box': return '';
        case 'qr': return `QR: ${el.value ?? el.field ?? el.expression ?? ''}`;
        case 'barcode': return `${el.symbology}: ${el.value ?? el.field ?? el.expression ?? ''}`;
        case 'richtext': {
          const preview = el.content.replace(/\s+/g, ' ').trim();
          const tag = el.mode === 'markdown' ? 'markdown' : 'html';
          const text = preview.length > 48 ? `${preview.slice(0, 48)}…` : preview || `[${tag}]`;
          return `[${tag}] ${text}`;
        }
      }
    })();
    return html`
      <div class="element ${isSel ? 'selected' : ''} ${el.kind === 'richtext' ? 'richtext' : ''}"
           style="${style}"
           @click=${(e: MouseEvent) => e.stopPropagation()}
           @contextmenu=${(e: MouseEvent) => this._onElementContextMenu(e, band, el.id)}
           @pointerdown=${(e: PointerEvent) => {
             if (e.button === 2) {
               e.preventDefault();
               this._onElementContextMenu(e, band, el.id);
               return;
             }
             this._onElementPointerDown(e, band, el.id, 'move');
           }}>
        <span class="kind">${el.kind}</span>
        <div class="${el.kind === 'richtext' ? 'element-preview' : ''}">${label}</div>
        ${showHandles
          ? html`<div class="resize-handles" aria-hidden="true">
              ${RESIZE_HANDLE_KINDS.map(
                (h) =>
                  html`<div
                    class="resize-handle resize-${h}"
                    @pointerdown=${(e: PointerEvent) => {
                      e.stopPropagation();
                      this._onElementPointerDown(e, band, el.id, h);
                    }}
                  ></div>`,
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  private _renderProperties() {
    if (!this._selectedBand || this._selectedIds.size === 0) return this._renderDocumentProperties();
    const band = this._schema.bands[this._selectedBand];

    if (this._selectedIds.size > 1) {
      const n = this._selectedIds.size;
      return html`
        <form class="props" @submit=${(e: Event) => e.preventDefault()}>
          <div class="group">
            <h4>${String(n)}</h4>
            <p style="margin:0;font-size:12px;color:#64748b;line-height:1.45">${t(this._uiLocale, 'multiSelectionHint')}</p>
          </div>
          <button class="danger" type="button" @click=${() => this._deleteSelected()}>${t(this._uiLocale, 'delete')}</button>
        </form>
      `;
    }

    const onlyId = [...this._selectedIds][0]!;
    const el = band?.elements.find((e) => e.id === onlyId);
    if (!el) return html`<div class="empty-hint">Element not found</div>`;
    const update = (patch: Partial<ReportElement>) => this._updateElement(this._selectedBand!, el.id, patch);
    const updateStyle = (patch: Partial<Style>) => update({ style: { ...(el.style ?? {}), ...patch } });
    const border = el.style?.border ?? {};

    return html`
      <form class="props" @submit=${(e: Event) => e.preventDefault()}>
        <div class="group">
          <h4>${el.kind.toUpperCase()} — id: ${el.id}</h4>
          <div class="grid4">
            <label>x<input type="number" .value=${String(el.pos.x)} @input=${(e: Event) => update({ pos: { ...el.pos, x: Number((e.target as HTMLInputElement).value) } })} /></label>
            <label>y<input type="number" .value=${String(el.pos.y)} @input=${(e: Event) => update({ pos: { ...el.pos, y: Number((e.target as HTMLInputElement).value) } })} /></label>
            ${el.kind === 'line'
              ? el.orientation === 'horizontal'
                ? html`
                    <label>w (length)<input type="number" min="5" .value=${String(el.pos.w)} @input=${(e: Event) => update({ pos: { ...el.pos, w: Number((e.target as HTMLInputElement).value) } })} /></label>
                    <label>h (${t(this._uiLocale, 'thickness')})<input type="number" readonly disabled .value=${String(lineThicknessMm(el.thickness ?? 1))} /></label>
                  `
                : html`
                    <label>w (${t(this._uiLocale, 'thickness')})<input type="number" readonly disabled .value=${String(lineThicknessMm(el.thickness ?? 1))} /></label>
                    <label>h (length)<input type="number" min="5" .value=${String(el.pos.h)} @input=${(e: Event) => update({ pos: { ...el.pos, h: Number((e.target as HTMLInputElement).value) } })} /></label>
                  `
              : html`
                  <label>w<input type="number" .value=${String(el.pos.w)} @input=${(e: Event) => update({ pos: { ...el.pos, w: Number((e.target as HTMLInputElement).value) } })} /></label>
                  <label>h<input type="number" .value=${String(el.pos.h)} @input=${(e: Event) => update({ pos: { ...el.pos, h: Number((e.target as HTMLInputElement).value) } })} /></label>
                `}
          </div>
          <label>${t(this._uiLocale, 'visibleWhen')}<input .value=${el.visibleWhen ?? ''} placeholder="amount > 0" @input=${(e: Event) => update({ visibleWhen: (e.target as HTMLInputElement).value || undefined })} /></label>
        </div>

        <div class="group">
          <h4>${t(this._uiLocale, 'style')}</h4>
          <label>${t(this._uiLocale, 'fontFamily')}<input .value=${el.style?.font ?? ''} placeholder="inherit" @input=${(e: Event) => updateStyle({ font: (e.target as HTMLInputElement).value || undefined })} /></label>
          <div class="grid2">
            <label>${t(this._uiLocale, 'fontSize')}<input type="number" min="4" max="96" .value=${String(el.style?.fontSize ?? 10)} @input=${(e: Event) => updateStyle({ fontSize: Number((e.target as HTMLInputElement).value) })} /></label>
            <label>${t(this._uiLocale, 'align')}
              <select @change=${(e: Event) => updateStyle({ align: ((e.target as HTMLSelectElement).value || undefined) as Style['align'] })}>
                <option value="">-</option>
                <option value="start" ?selected=${el.style?.align === 'start'}>start</option>
                <option value="center" ?selected=${el.style?.align === 'center'}>center</option>
                <option value="end" ?selected=${el.style?.align === 'end'}>end</option>
                <option value="justify" ?selected=${el.style?.align === 'justify'}>justify</option>
              </select>
            </label>
          </div>
          <div class="grid2">
            <label>${t(this._uiLocale, 'color')}<input type="color" .value=${el.style?.color ?? '#111111'} @input=${(e: Event) => updateStyle({ color: (e.target as HTMLInputElement).value })} /></label>
            <label>${t(this._uiLocale, 'background')}<input type="color" .value=${el.style?.background ?? '#ffffff'} @input=${(e: Event) => updateStyle({ background: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <div class="grid4">
            <label><input type="checkbox" .checked=${!!el.style?.bold} @change=${(e: Event) => updateStyle({ bold: (e.target as HTMLInputElement).checked })} /> ${t(this._uiLocale, 'bold')}</label>
            <label><input type="checkbox" .checked=${!!el.style?.italic} @change=${(e: Event) => updateStyle({ italic: (e.target as HTMLInputElement).checked })} /> ${t(this._uiLocale, 'italic')}</label>
            <label><input type="checkbox" .checked=${!!el.style?.underline} @change=${(e: Event) => updateStyle({ underline: (e.target as HTMLInputElement).checked })} /> ${t(this._uiLocale, 'underline')}</label>
            <label>${t(this._uiLocale, 'padding')}<input type="number" min="0" max="40" .value=${String(el.style?.padding ?? 0)} @input=${(e: Event) => updateStyle({ padding: Number((e.target as HTMLInputElement).value) || undefined })} /></label>
          </div>
        </div>

        <div class="group">
          <h4>${t(this._uiLocale, 'border')}</h4>
          <div class="grid4">
            <label>${t(this._uiLocale, 'top')}<input type="number" min="0" .value=${String(border.top ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, top: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
            <label>${t(this._uiLocale, 'right')}<input type="number" min="0" .value=${String(border.right ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, right: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
            <label>${t(this._uiLocale, 'bottom')}<input type="number" min="0" .value=${String(border.bottom ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, bottom: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
            <label>${t(this._uiLocale, 'left')}<input type="number" min="0" .value=${String(border.left ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, left: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
          </div>
          <label>${t(this._uiLocale, 'color')}<input type="color" .value=${border.color ?? '#000000'} @input=${(e: Event) => updateStyle({ border: { ...border, color: (e.target as HTMLInputElement).value } })} /></label>
        </div>

        <div class="group">
          <h4>${t(this._uiLocale, 'conditional')}</h4>
          ${(el.cond ?? []).map((rule, idx) => this._renderCondRule(rule, idx, el))}
          <button class="secondary" type="button" @click=${() => this._addCondRule(el)}>+ ${t(this._uiLocale, 'addRule')}</button>
        </div>

        ${this._renderKindSpecific(el, update)}

        <button class="danger" type="button" @click=${() => this._deleteSelected()}>${t(this._uiLocale, 'delete')}</button>
      </form>
    `;
  }

  private _renderCondRule(rule: ConditionalFormatRule, idx: number, el: ReportElement) {
    const updateRule = (patch: Partial<ConditionalFormatRule>) => {
      const next = [...(el.cond ?? [])];
      next[idx] = { ...rule, ...patch, style: { ...rule.style, ...(patch.style ?? {}) } };
      this._updateElement(this._selectedBand!, el.id, { cond: next });
    };
    const removeRule = () => {
      const next = (el.cond ?? []).filter((_, i) => i !== idx);
      this._updateElement(this._selectedBand!, el.id, { cond: next.length > 0 ? next : undefined });
    };
    return html`
      <div class="cond-rule">
        <div class="row">
          <input placeholder=${t(this._uiLocale, 'when')} .value=${rule.when} @input=${(e: Event) => updateRule({ when: (e.target as HTMLInputElement).value })} />
          <button class="danger" type="button" @click=${removeRule} title=${t(this._uiLocale, 'delete')}>×</button>
        </div>
        <div class="row">
          <label style="flex:1">${t(this._uiLocale, 'color')}<input type="color" .value=${rule.style.color ?? '#111111'} @input=${(e: Event) => updateRule({ style: { color: (e.target as HTMLInputElement).value } })} /></label>
          <label style="flex:1">${t(this._uiLocale, 'background')}<input type="color" .value=${rule.style.background ?? '#ffffff'} @input=${(e: Event) => updateRule({ style: { background: (e.target as HTMLInputElement).value } })} /></label>
        </div>
        <div class="row">
          <label><input type="checkbox" .checked=${!!rule.style.bold} @change=${(e: Event) => updateRule({ style: { bold: (e.target as HTMLInputElement).checked } })} /> ${t(this._uiLocale, 'bold')}</label>
          <label><input type="checkbox" .checked=${!!rule.style.italic} @change=${(e: Event) => updateRule({ style: { italic: (e.target as HTMLInputElement).checked } })} /> ${t(this._uiLocale, 'italic')}</label>
        </div>
      </div>
    `;
  }

  private _addCondRule(el: ReportElement): void {
    const next = [...(el.cond ?? []), { when: 'true', style: { color: '#111111' } } as ConditionalFormatRule];
    this._updateElement(this._selectedBand!, el.id, { cond: next });
  }

  private _patchRootBand(key: BandKey, patch: Partial<Band>): void {
    const cur = this._schema.bands[key];
    if (key !== 'detail' && cur === undefined) return;
    const base: Band = cur ?? { height: 10, elements: [] };
    const merged = { ...base, ...patch };
    const elements = merged.elements.map((e) => ({ ...e, pos: this._clampElementPos(key, e.pos) }));
    this._setSchema({ ...this._schema, bands: { ...this._schema.bands, [key]: { ...merged, elements } } });
  }

  private _enableRootBand(key: Exclude<BandKey, 'detail'>): void {
    const heights: Record<Exclude<BandKey, 'detail'>, number> = {
      reportHeader: 18,
      pageHeader: 12,
      pageFooter: 10,
      reportFooter: 16,
    };
    this._setSchema({
      ...this._schema,
      bands: { ...this._schema.bands, [key]: { height: heights[key], elements: [] } },
    });
    logger.info('reports-builder', 'enabled root band', { band: key });
  }

  private _disableRootBand(key: Exclude<BandKey, 'detail'>): void {
    if (this._selectedBand === key) this._clearSelection();
    this._setSchema({ ...this._schema, bands: { ...this._schema.bands, [key]: undefined } });
    logger.info('reports-builder', 'removed root band', { band: key });
  }

  private _patchGroupAt(idx: number, patch: Partial<Group>): void {
    const next = [...this._schema.groups];
    const prev = next[idx];
    if (!prev) return;
    next[idx] = { ...prev, ...patch };
    this._setSchema({ ...this._schema, groups: next });
  }

  private _patchGroupBandAt(idx: number, slot: 'header' | 'footer', patch: Partial<Band>): void {
    const g = this._schema.groups[idx];
    if (!g) return;
    const cur = g[slot];
    const base: Band = cur ?? { height: 8, elements: [] };
    this._patchGroupAt(idx, { [slot]: { ...base, ...patch } });
  }

  private _setGroupBandAt(idx: number, slot: 'header' | 'footer', band: Band | undefined): void {
    this._patchGroupAt(idx, { [slot]: band });
    logger.info('reports-builder', 'group band changed', { slot, idx, active: Boolean(band) });
  }

  private _renderNestedBandSection(
    title: string,
    band: Band | undefined,
    ops: { onPatch: (p: Partial<Band>) => void; onEnable: () => void; onRemove: () => void },
  ) {
    if (!band) {
      return html`
        <div class="nested-band">
          <h6>${title}</h6>
          <button type="button" class="secondary" @click=${ops.onEnable}>${t(this._uiLocale, 'enable')}</button>
        </div>
      `;
    }
    return html`
      <div class="nested-band">
        <h6>${title}</h6>
        <label>${t(this._uiLocale, 'heightMm')}
          <input type="number" min="0" step="0.5" .value=${String(band.height)}
                 @input=${(e: Event) => ops.onPatch({ height: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label><input type="checkbox" .checked=${!!band.pageBreakBefore}
               @change=${(e: Event) =>
                 ops.onPatch({ pageBreakBefore: (e.target as HTMLInputElement).checked ? true : undefined })} />
          ${t(this._uiLocale, 'pageBreakBefore')}</label>
        <label><input type="checkbox" .checked=${!!band.pageBreakAfter}
               @change=${(e: Event) =>
                 ops.onPatch({ pageBreakAfter: (e.target as HTMLInputElement).checked ? true : undefined })} />
          ${t(this._uiLocale, 'pageBreakAfter')}</label>
        <div class="band-actions">
          <button type="button" class="danger" @click=${ops.onRemove}>${t(this._uiLocale, 'removeSection')}</button>
        </div>
      </div>
    `;
  }

  private _renderRootBandBlock(key: BandKey) {
    const band = this._schema.bands[key];
    const title = t(this._uiLocale, key as 'reportHeader');
    if (key !== 'detail' && !band) {
      return html`
        <div class="sub-panel" data-root-band=${key}>
          <h5>${title}</h5>
          <button type="button" class="secondary" @click=${() => this._enableRootBand(key)}>${t(this._uiLocale, 'enable')}</button>
        </div>
      `;
    }
    const b = band as Band;
    return html`
      <div class="sub-panel" data-root-band=${key}>
        <h5>${title}</h5>
        <label>${t(this._uiLocale, 'heightMm')}
          <input type="number" min="0" step="0.5" .value=${String(b.height)}
                 @input=${(e: Event) => this._patchRootBand(key, { height: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label><input type="checkbox" .checked=${!!b.pageBreakBefore}
               @change=${(e: Event) =>
                 this._patchRootBand(key, {
                   pageBreakBefore: (e.target as HTMLInputElement).checked ? true : undefined,
                 })} />
          ${t(this._uiLocale, 'pageBreakBefore')}</label>
        <label><input type="checkbox" .checked=${!!b.pageBreakAfter}
               @change=${(e: Event) =>
                 this._patchRootBand(key, { pageBreakAfter: (e.target as HTMLInputElement).checked ? true : undefined })} />
          ${t(this._uiLocale, 'pageBreakAfter')}</label>
        ${key !== 'detail'
          ? html`
              <div class="band-actions">
                <button type="button" class="danger" @click=${() => this._disableRootBand(key)}>
                  ${t(this._uiLocale, 'removeSection')}
                </button>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderReportBandsEditor() {
    return html`
      <div class="group">
        <h4>${t(this._uiLocale, 'reportBands')}</h4>
        ${BAND_KEYS.map((key) => this._renderRootBandBlock(key))}
      </div>
    `;
  }

  private _renderGroupBlock(g: Group, idx: number) {
    return html`
      <div class="sub-panel" data-group-index=${String(idx)}>
        <h5>${t(this._uiLocale, 'reportGroups')} #${idx + 1}</h5>
        <label>${t(this._uiLocale, 'groupByField')}
          <input .value=${g.key}
                 @input=${(e: Event) => this._patchGroupAt(idx, { key: (e.target as HTMLInputElement).value })} />
        </label>
        <label><input type="checkbox" .checked=${!!g.resetPageNumber}
               @change=${(e: Event) =>
                 this._patchGroupAt(idx, {
                   resetPageNumber: (e.target as HTMLInputElement).checked ? true : undefined,
                 })} />
          ${t(this._uiLocale, 'resetPageNumber')}</label>
        ${this._renderNestedBandSection(t(this._uiLocale, 'groupHeader'), g.header, {
          onPatch: (p) => this._patchGroupBandAt(idx, 'header', p),
          onEnable: () => this._setGroupBandAt(idx, 'header', { height: 8, elements: [] }),
          onRemove: () => this._setGroupBandAt(idx, 'header', undefined),
        })}
        ${this._renderNestedBandSection(t(this._uiLocale, 'groupFooter'), g.footer, {
          onPatch: (p) => this._patchGroupBandAt(idx, 'footer', p),
          onEnable: () => this._setGroupBandAt(idx, 'footer', { height: 8, elements: [] }),
          onRemove: () => this._setGroupBandAt(idx, 'footer', undefined),
        })}
      </div>
    `;
  }

  private _renderGroupsBandsEditor() {
    const groups = this._schema.groups;
    if (groups.length === 0) {
      return html`
        <div class="group">
          <h4>${t(this._uiLocale, 'reportGroups')}</h4>
          <div class="empty-hint" style="padding:8px">${t(this._uiLocale, 'none')}</div>
        </div>
      `;
    }
    return html`
      <div class="group">
        <h4>${t(this._uiLocale, 'reportGroups')}</h4>
        ${groups.map((g, idx) => this._renderGroupBlock(g, idx))}
      </div>
    `;
  }

  private _renderDocumentProperties() {
    const meta = this._schema.meta;
    const page = this._schema.page;
    const updateMeta = (patch: Partial<ReportSchemaV1['meta']>) => {
      this._setSchema({ ...this._schema, meta: { ...meta, ...patch } });
    };
    const updatePage = (patch: Partial<ReportSchemaV1['page']>) => {
      this._setSchema({ ...this._schema, page: { ...this._schema.page, ...patch } });
      this._reclampAllRootBandElements();
    };
    const updateMargins = (patch: Partial<ReportSchemaV1['page']['margins']>) => {
      this._setSchema({
        ...this._schema,
        page: { ...this._schema.page, margins: { ...this._schema.page.margins, ...patch } },
      });
      this._reclampAllRootBandElements();
    };

    return html`
      <form class="props" @submit=${(e: Event) => e.preventDefault()}>
        <div class="group">
          <h4>${t(this._uiLocale, 'document')}</h4>
          <label>${t(this._uiLocale, 'description')}<input .value=${meta.description ?? ''} @input=${(e: Event) => updateMeta({ description: (e.target as HTMLInputElement).value || undefined })} /></label>
          <div class="grid2">
            <label>${t(this._uiLocale, 'locale')}
              <select @change=${(e: Event) => updateMeta({ locale: (e.target as HTMLSelectElement).value as 'ar' | 'en' })}>
                <option value="en" ?selected=${meta.locale === 'en'}>en</option>
                <option value="ar" ?selected=${meta.locale === 'ar'}>ar</option>
              </select>
            </label>
            <label>${t(this._uiLocale, 'direction')}
              <select @change=${(e: Event) => updateMeta({ dir: (e.target as HTMLSelectElement).value as 'rtl' | 'ltr' })}>
                <option value="ltr" ?selected=${meta.dir === 'ltr'}>ltr</option>
                <option value="rtl" ?selected=${meta.dir === 'rtl'}>rtl</option>
              </select>
            </label>
          </div>
        </div>

        <div class="group">
          <h4>${t(this._uiLocale, 'page')}</h4>
          <div class="grid2">
            <label>${t(this._uiLocale, 'paperSize')}
              <select @change=${(e: Event) => updatePage({ size: (e.target as HTMLSelectElement).value as 'A4' | 'A5' | 'Letter' })}>
                <option value="A4" ?selected=${page.size === 'A4'}>A4</option>
                <option value="A5" ?selected=${page.size === 'A5'}>A5</option>
                <option value="Letter" ?selected=${page.size === 'Letter'}>Letter</option>
              </select>
            </label>
            <label>${t(this._uiLocale, 'orientation')}
              <select @change=${(e: Event) => updatePage({ orientation: (e.target as HTMLSelectElement).value as 'portrait' | 'landscape' })}>
                <option value="portrait" ?selected=${page.orientation === 'portrait'}>${t(this._uiLocale, 'portrait')}</option>
                <option value="landscape" ?selected=${page.orientation === 'landscape'}>${t(this._uiLocale, 'landscape')}</option>
              </select>
            </label>
          </div>
          <div class="grid4">
            <label>${t(this._uiLocale, 'top')}<input type="number" min="0" .value=${String(page.margins.top)} @input=${(e: Event) => updateMargins({ top: Number((e.target as HTMLInputElement).value) })} /></label>
            <label>${t(this._uiLocale, 'right')}<input type="number" min="0" .value=${String(page.margins.right)} @input=${(e: Event) => updateMargins({ right: Number((e.target as HTMLInputElement).value) })} /></label>
            <label>${t(this._uiLocale, 'bottom')}<input type="number" min="0" .value=${String(page.margins.bottom)} @input=${(e: Event) => updateMargins({ bottom: Number((e.target as HTMLInputElement).value) })} /></label>
            <label>${t(this._uiLocale, 'left')}<input type="number" min="0" .value=${String(page.margins.left)} @input=${(e: Event) => updateMargins({ left: Number((e.target as HTMLInputElement).value) })} /></label>
          </div>
        </div>

        ${this._renderReportBandsEditor()}
        ${this._renderGroupsBandsEditor()}

        ${this._renderWatermarkEditor()}
      </form>
    `;
  }

  private _renderWatermarkEditor() {
    const wm = this._schema.watermark;
    const setWatermark = (next: Watermark | undefined) => {
      this._setSchema({ ...this._schema, ...(next ? { watermark: next } : (() => { const { watermark: _w, ...rest } = this._schema; return rest; })()) });
    };
    if (!wm) {
      return html`
        <div class="group">
          <h4>${t(this._uiLocale, 'watermark')}</h4>
          <div class="grid2">
            <button class="secondary" type="button" @click=${() => setWatermark({ kind: 'text', text: 'CONFIDENTIAL', fontSize: 72, color: '#cccccc', opacity: 0.2, rotation: -30 })}>+ ${t(this._uiLocale, 'text')}</button>
            <button class="secondary" type="button" @click=${() => setWatermark({ kind: 'image', src: '', opacity: 0.15, rotation: 0, width: 120 })}>+ ${t(this._uiLocale, 'image')}</button>
          </div>
        </div>
      `;
    }
    const updateText = (patch: Partial<Extract<Watermark, { kind: 'text' }>>) => {
      if (wm.kind !== 'text') return;
      setWatermark({ ...wm, ...patch });
    };
    const updateImage = (patch: Partial<Extract<Watermark, { kind: 'image' }>>) => {
      if (wm.kind !== 'image') return;
      setWatermark({ ...wm, ...patch });
    };
    if (wm.kind === 'text') {
      return html`
        <div class="group">
          <h4>${t(this._uiLocale, 'watermark')} — ${t(this._uiLocale, 'text')}</h4>
          <label>${t(this._uiLocale, 'text')}<input .value=${wm.text} @input=${(e: Event) => updateText({ text: (e.target as HTMLInputElement).value })} /></label>
          <label>${t(this._uiLocale, 'expression')}<input placeholder='"DRAFT — " + meta.name' .value=${wm.expression ?? ''} @input=${(e: Event) => updateText({ expression: (e.target as HTMLInputElement).value || undefined })} /></label>
          <div class="grid2">
            <label>${t(this._uiLocale, 'fontSize')}<input type="number" min="8" max="300" .value=${String(wm.fontSize)} @input=${(e: Event) => updateText({ fontSize: Number((e.target as HTMLInputElement).value) })} /></label>
            <label>${t(this._uiLocale, 'color')}<input type="color" .value=${wm.color} @input=${(e: Event) => updateText({ color: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <div class="grid2">
            <label>${t(this._uiLocale, 'opacity')}<input type="number" min="0" max="1" step="0.05" .value=${String(wm.opacity)} @input=${(e: Event) => updateText({ opacity: Number((e.target as HTMLInputElement).value) })} /></label>
            <label>${t(this._uiLocale, 'rotation')}<input type="number" min="-180" max="180" .value=${String(wm.rotation)} @input=${(e: Event) => updateText({ rotation: Number((e.target as HTMLInputElement).value) })} /></label>
          </div>
          <button class="danger" type="button" @click=${() => setWatermark(undefined)}>${t(this._uiLocale, 'delete')}</button>
        </div>
      `;
    }
    return html`
      <div class="group">
        <h4>${t(this._uiLocale, 'watermark')} — ${t(this._uiLocale, 'image')}</h4>
        <label>${t(this._uiLocale, 'src')}<input placeholder="https://..." .value=${wm.src} @input=${(e: Event) => updateImage({ src: (e.target as HTMLInputElement).value })} /></label>
        <div class="grid2">
          <label>${t(this._uiLocale, 'opacity')}<input type="number" min="0" max="1" step="0.05" .value=${String(wm.opacity)} @input=${(e: Event) => updateImage({ opacity: Number((e.target as HTMLInputElement).value) })} /></label>
          <label>${t(this._uiLocale, 'rotation')}<input type="number" min="-180" max="180" .value=${String(wm.rotation)} @input=${(e: Event) => updateImage({ rotation: Number((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <label>w (mm)<input type="number" min="10" max="400" .value=${String(wm.width)} @input=${(e: Event) => updateImage({ width: Number((e.target as HTMLInputElement).value) })} /></label>
        <button class="danger" type="button" @click=${() => setWatermark(undefined)}>${t(this._uiLocale, 'delete')}</button>
      </div>
    `;
  }

  private _renderKindSpecific(el: ReportElement, update: (p: Partial<ReportElement>) => void) {
    if (el.kind === 'text') {
      return html`<label>value<input .value=${el.value} @input=${(e: Event) => update({ value: (e.target as HTMLInputElement).value } as Partial<ReportElement>)} /></label>`;
    }
    if (el.kind === 'field') {
      return html`
        <label>field
          <select @change=${(e: Event) => update({ field: (e.target as HTMLSelectElement).value } as Partial<ReportElement>)}>
            ${this._fields.map((f) => html`<option value=${f.name} ?selected=${el.field === f.name}>${f.name}</option>`)}
          </select>
        </label>
        <label>format<input .value=${el.format ?? ''} placeholder="decimal2, date, currency:USD" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
      `;
    }
    if (el.kind === 'aggregate') {
      return html`
        <div class="group">
          <h4>${el.kind}</h4>
          <div class="grid2">
            <label>fn
              <select @change=${(e: Event) => update({ fn: (e.target as HTMLSelectElement).value as 'sum' } as Partial<ReportElement>)}>
                ${['sum','count','avg','min','max'].map((f) => html`<option value=${f} ?selected=${el.fn === f}>${f}</option>`)}
              </select>
            </label>
            <label>scope
              <select @change=${(e: Event) => update({ scope: (e.target as HTMLSelectElement).value as 'report' } as Partial<ReportElement>)}>
                ${['report','page','group'].map((s) => html`<option value=${s} ?selected=${el.scope === s}>${s}</option>`)}
              </select>
            </label>
          </div>
          <label>field
            <select @change=${(e: Event) => update({ field: (e.target as HTMLSelectElement).value } as Partial<ReportElement>)}>
              ${this._fields.map((f) => html`<option value=${f.name} ?selected=${el.field === f.name}>${f.name}</option>`)}
            </select>
          </label>
          <label>groupKey<input .value=${el.groupKey ?? ''} placeholder="region (only for scope=group)" @input=${(e: Event) => update({ groupKey: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
          <label>format<input .value=${el.format ?? ''} placeholder="decimal2" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
        </div>
      `;
    }
    if (el.kind === 'chart') {
      return html`
        <label>type
          <select @change=${(e: Event) => update({ type: (e.target as HTMLSelectElement).value as 'bar' } as Partial<ReportElement>)}>
            ${['bar','line','pie','doughnut'].map((c) => html`<option value=${c} ?selected=${el.type === c}>${c}</option>`)}
          </select>
        </label>
        <label>labels field
          <select @change=${(e: Event) => update({ labelsField: (e.target as HTMLSelectElement).value } as Partial<ReportElement>)}>
            ${this._fields.map((f) => html`<option value=${f.name} ?selected=${el.labelsField === f.name}>${f.name}</option>`)}
          </select>
        </label>
        <label>value field
          <select @change=${(e: Event) => update({ valueField: (e.target as HTMLSelectElement).value } as Partial<ReportElement>)}>
            ${this._fields.map((f) => html`<option value=${f.name} ?selected=${el.valueField === f.name}>${f.name}</option>`)}
          </select>
        </label>
        <label>title<input .value=${el.title ?? ''} @input=${(e: Event) => update({ title: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
      `;
    }
    if (el.kind === 'expr') {
      return html`
        <label>expression<input .value=${el.expression} placeholder="now()" @input=${(e: Event) => update({ expression: (e.target as HTMLInputElement).value } as Partial<ReportElement>)} /></label>
        <label>format<input .value=${el.format ?? ''} placeholder="datetime" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
      `;
    }
    if (el.kind === 'image') {
      return html`
        <div class="group">
          <h4>${el.kind}</h4>
          <label>${t(this._uiLocale, 'src')}<input .value=${el.src} placeholder="https://..." @input=${(e: Event) => update({ src: (e.target as HTMLInputElement).value } as Partial<ReportElement>)} /></label>
          <label>${t(this._uiLocale, 'alt')}<input .value=${el.alt ?? ''} @input=${(e: Event) => update({ alt: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
          <label>${t(this._uiLocale, 'fit')}
            <select @change=${(e: Event) => update({ fit: ((e.target as HTMLSelectElement).value || undefined) as 'contain' } as Partial<ReportElement>)}>
              <option value="">-</option>
              <option value="contain" ?selected=${el.fit === 'contain'}>contain</option>
              <option value="cover" ?selected=${el.fit === 'cover'}>cover</option>
              <option value="fill" ?selected=${el.fit === 'fill'}>fill</option>
            </select>
          </label>
        </div>
      `;
    }
    if (el.kind === 'richtext') {
      const appendField = (name: string) => update({ content: `${el.content}<${name}>` } as Partial<ReportElement>);
      const titleKey = el.mode === 'markdown' ? 'markdown' : 'html';
      return html`
        <div class="group">
          <h4>${t(this._uiLocale, titleKey)}</h4>
          <p class="hint">${t(this._uiLocale, 'fieldPlaceholderHint')}</p>
          <label>${t(this._uiLocale, 'content')}
            <textarea rows="8" .value=${el.content} @input=${(e: Event) => update({ content: (e.target as HTMLTextAreaElement).value } as Partial<ReportElement>)}></textarea>
          </label>
          <label>format<input .value=${el.format ?? ''} placeholder="decimal2, date" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
          ${this._fields.length
            ? html`<div class="field-chips">${this._fields.map((f) => html`<button type="button" class="chip" @click=${() => appendField(f.name)}>&lt;${f.name}&gt;</button>`)}</div>`
            : nothing}
        </div>
      `;
    }
    if (el.kind === 'qr' || el.kind === 'barcode') {
      const symbologies = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'ITF14'] as const;
      return html`
        <div class="group">
          <h4>${t(this._uiLocale, el.kind)}</h4>
          <label>${t(this._uiLocale, 'value')}<input .value=${el.value ?? ''} placeholder="static text" @input=${(e: Event) => update({ value: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
          <label>${t(this._uiLocale, 'field')}
            <select @change=${(e: Event) => update({ field: (e.target as HTMLSelectElement).value || undefined } as Partial<ReportElement>)}>
              <option value="">-</option>
              ${this._fields.map((f) => html`<option value=${f.name} ?selected=${el.field === f.name}>${f.name}</option>`)}
            </select>
          </label>
          <label>${t(this._uiLocale, 'expression')}<input .value=${el.expression ?? ''} placeholder="orderId" @input=${(e: Event) => update({ expression: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
          <label>format<input .value=${el.format ?? ''} placeholder="decimal2" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Partial<ReportElement>)} /></label>
          ${el.kind === 'qr'
            ? html`<label>${t(this._uiLocale, 'errorCorrection')}
                <select @change=${(e: Event) => update({ errorCorrectionLevel: (e.target as HTMLSelectElement).value as 'M' } as Partial<ReportElement>)}>
                  ${['L', 'M', 'Q', 'H'].map((lvl) => html`<option value=${lvl} ?selected=${el.errorCorrectionLevel === lvl}>${lvl}</option>`)}
                </select>
              </label>`
            : html`
                <label>${t(this._uiLocale, 'symbology')}
                  <select @change=${(e: Event) => update({ symbology: (e.target as HTMLSelectElement).value as 'CODE128' } as Partial<ReportElement>)}>
                    ${symbologies.map((s) => html`<option value=${s} ?selected=${el.symbology === s}>${s}</option>`)}
                  </select>
                </label>
                <label><input type="checkbox" .checked=${el.displayValue !== false} @change=${(e: Event) => update({ displayValue: (e.target as HTMLInputElement).checked } as Partial<ReportElement>)} /> ${t(this._uiLocale, 'displayValue')}</label>
              `}
        </div>
      `;
    }
    if (el.kind === 'line') {
      return html`
        <div class="group">
          <h4>${el.kind}</h4>
          <div class="grid2">
            <label>${t(this._uiLocale, 'orientation')}
              <select @change=${(e: Event) => update({ orientation: (e.target as HTMLSelectElement).value as 'horizontal' } as Partial<ReportElement>)}>
                <option value="horizontal" ?selected=${el.orientation === 'horizontal'}>horizontal</option>
                <option value="vertical" ?selected=${el.orientation === 'vertical'}>vertical</option>
              </select>
            </label>
            <label>${t(this._uiLocale, 'thickness')}<input type="number" min="0.25" max="10" step="0.25" .value=${String(el.thickness)} @input=${(e: Event) => update({ thickness: Number((e.target as HTMLInputElement).value) } as Partial<ReportElement>)} /></label>
          </div>
          <label>${t(this._uiLocale, 'color')}<input type="color" .value=${el.color ?? '#000000'} @input=${(e: Event) => update({ color: (e.target as HTMLInputElement).value } as Partial<ReportElement>)} /></label>
        </div>
      `;
    }
    return nothing;
  }

  private async _save(): Promise<void> {
    const v = validateReport(this._schema);
    if (!v.ok) {
      logger.error('reports-builder', 'invalid schema on save', { error: v.error });
      this.dispatchEvent(new CustomEvent('save-error', { detail: { error: v.error } }));
      return;
    }
    const finalSchema: ReportSchemaV1 = {
      ...v.value,
      meta: { ...v.value.meta, updatedAt: new Date().toISOString() },
    };
    this._replaceSchema(finalSchema);
    if (this.storageAdapter) {
      try {
        await this.storageAdapter.save(finalSchema.id, finalSchema);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('reports-builder', 'storage save failed', { error: msg });
        this.dispatchEvent(new CustomEvent('save-error', { detail: { error: msg } }));
        return;
      }
    }
    this.dispatchEvent(new CustomEvent('save', { detail: { schema: finalSchema } }));
  }

  private _exportJson(): void {
    const json = JSON.stringify(this._schema, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    this.dispatchEvent(new CustomEvent('export-json', { detail: { blob, filename: `${this._schema.id}.json` } }));
  }

  private _toggleLeft(): void {
    this._leftCollapsed = !this._leftCollapsed;
  }
  private _toggleMenu(): void {
    this._menuOpen = !this._menuOpen;
  }
  private _setZoom(value: number): void {
    this._zoom = Math.min(MAX_BUILDER_ZOOM, Math.max(MIN_BUILDER_ZOOM, Math.round(value * 100) / 100));
  }
  private _zoomIn(): void {
    this._setZoom(this._zoom + BUILDER_ZOOM_STEP);
  }
  private _zoomOut(): void {
    this._setZoom(this._zoom - BUILDER_ZOOM_STEP);
  }
  private _zoomReset(): void {
    this._setZoom(1);
  }
  private _toggleSection(key: SideSectionKey): void {
    this._collapsedSections = { ...this._collapsedSections, [key]: !this._collapsedSections[key] };
  }
  private _toggleAction(a: BuilderAction): void {
    const current = new Set(this.actions);
    if (current.has(a)) current.delete(a);
    else current.add(a);
    this.actions = ['save', 'json', 'preview'].filter((x) => current.has(x as BuilderAction)) as readonly BuilderAction[];
  }

  private _renderSideSection(key: SideSectionKey, title: string, content: unknown) {
    const collapsed = this._collapsedSections[key];
    return html`
      <section class="side-section" data-section=${key}>
        <button
          type="button" class="section-head" data-control=${`toggle-section-${key}`}
          aria-expanded=${collapsed ? 'false' : 'true'}
          @click=${() => this._toggleSection(key)}
        >
          <span class="section-title">${title}</span>
          ${icon(collapsed ? 'sectionDown' : 'sectionUp')}
        </button>
        ${collapsed ? nothing : html`<div class="section-body">${content}</div>`}
      </section>
    `;
  }

  private _renderActionsSection() {
    const items = (this.actions ?? BUILDER_DEFAULT_ACTIONS).filter((a) => a === 'save' || a === 'json' || a === 'preview');
    const canUndo = this._undoStack.length > 0;
    const canRedo = this._redoStack.length > 0;
    const zoomLabel = `${Math.round(this._zoom * 100)}%`;
    return html`
      <div class="doc-name">
        <label for="report-name">${t(this._uiLocale, 'document')}</label>
        <input
          id="report-name"
          class="name"
          aria-label=${t(this._uiLocale, 'document')}
          .value=${this._schema.meta.name}
          @input=${(e: Event) => { this._setSchema({ ...this._schema, meta: { ...this._schema.meta, name: (e.target as HTMLInputElement).value } }); }}
        />
      </div>
      <div class="toolbar" role="toolbar">
        <button
          type="button" class="icon-only" data-control="undo"
          aria-label=${t(this._uiLocale, 'undo')} title=${`${t(this._uiLocale, 'undo')} (Ctrl+Z)`}
          ?disabled=${!canUndo}
          @click=${() => this._undo()}
        >${icon('undo')}</button>
        <button
          type="button" class="icon-only" data-control="redo"
          aria-label=${t(this._uiLocale, 'redo')} title=${`${t(this._uiLocale, 'redo')} (Ctrl+Y)`}
          ?disabled=${!canRedo}
          @click=${() => this._redo()}
        >${icon('redo')}</button>
        <span class="sep"></span>
        <div class="zoom-tools" aria-label=${t(this._uiLocale, 'zoomReset')}>
          <button
            type="button" class="icon-only" data-control="zoom-out"
            aria-label=${t(this._uiLocale, 'zoomOut')} title=${t(this._uiLocale, 'zoomOut')}
            ?disabled=${this._zoom <= MIN_BUILDER_ZOOM}
            @click=${() => this._zoomOut()}
          >${icon('zoomOut')}</button>
          <button
            type="button" class="zoom-value" data-control="zoom-reset"
            aria-label=${t(this._uiLocale, 'zoomReset')} title=${t(this._uiLocale, 'zoomReset')}
            @click=${() => this._zoomReset()}
          >${zoomLabel}</button>
          <button
            type="button" class="icon-only" data-control="zoom-in"
            aria-label=${t(this._uiLocale, 'zoomIn')} title=${t(this._uiLocale, 'zoomIn')}
            ?disabled=${this._zoom >= MAX_BUILDER_ZOOM}
            @click=${() => this._zoomIn()}
          >${icon('zoomIn')}</button>
        </div>
        <span class="sep"></span>
        ${items.map((a) => this._renderToolbarAction(a))}
        <div class="customize">
          <button
            type="button" class="icon-only" data-control="customize"
            aria-label=${t(this._uiLocale, 'customize')} title=${t(this._uiLocale, 'customize')}
            aria-expanded=${this._menuOpen ? 'true' : 'false'}
            @click=${() => this._toggleMenu()}
          >${icon('cog')}</button>
          ${this._menuOpen
            ? html`<div class="menu" role="menu" @click=${(e: Event) => e.stopPropagation()}>
                ${(['save', 'json', 'preview'] as readonly BuilderAction[]).map(
                  (a) => html`<label>
                    <input type="checkbox" .checked=${this.actions.includes(a)} @change=${() => this._toggleAction(a)} />
                    ${a === 'json' ? html`JSON` : t(this._uiLocale, a === 'save' ? 'save' : 'preview')}
                  </label>`,
                )}
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderContextMenu(): unknown {
    if (!this._contextMenu) return nothing;
    const menuBand = this._contextMenu.band;
    const hasSelection = this._selectedIds.size > 0;
    const canPaste = Boolean(this._elementClipboard?.elements.length);
    const canLayer = hasSelection && Boolean(this._selectedBand);
    const canRemoveBand =
      menuBand !== 'detail' && Boolean(this._schema.bands[menuBand]);
    const run = (fn: () => void) => () => {
      fn();
      this._closeContextMenu();
    };
    const item = (
      key: 'cut' | 'copy' | 'paste' | 'delete' | 'bringToFront' | 'bringForward' | 'sendToBack' | 'sendBackward',
      iconName: string,
      disabled: boolean,
      action: () => void,
    ) => html`
      <li role="none">
        <button
          type="button"
          role="menuitem"
          data-ctx=${key}
          ?disabled=${disabled}
          @click=${run(action)}
        >${icon(iconName)}<span>${t(this._uiLocale, key)}</span></button>
      </li>
    `;
    return html`
      <ul
        class="ctx-menu"
        role="menu"
        style="left:${this._contextMenu.x}px;top:${this._contextMenu.y}px"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        ${item('cut', 'cut', !hasSelection, () => { this._cutSelectedElements(); })}
        ${item('copy', 'copy', !hasSelection, () => { this._copySelectedElements(); })}
        ${item('paste', 'paste', !canPaste, () => { this._pasteElements(); })}
        ${item('delete', 'trash', !hasSelection, () => { this._deleteSelected(); })}
        ${canRemoveBand
          ? html`
              <li class="ctx-sep" role="separator"></li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  data-ctx="removeSection"
                  @click=${run(() => this._disableRootBand(menuBand as Exclude<BandKey, 'detail'>))}
                >${icon('trash')}<span>${t(this._uiLocale, 'removeSection')}</span></button>
              </li>
            `
          : nothing}
        <li class="ctx-sep" role="separator"></li>
        ${item('bringToFront', 'bringToFront', !canLayer || !this._canBringToFront(), () => { this._bringToFront(); })}
        ${item('bringForward', 'bringForward', !canLayer || !this._canBringForward(), () => { this._bringForward(); })}
        ${item('sendToBack', 'sendToBack', !canLayer || !this._canSendToBack(), () => { this._sendToBack(); })}
        ${item('sendBackward', 'sendBackward', !canLayer || !this._canSendBackward(), () => { this._sendBackward(); })}
      </ul>
    `;
  }

  private _renderToolbarAction(a: BuilderAction) {
    if (a === 'save') {
      return html`<button
        type="button" data-action="save" class="primary"
        aria-label=${t(this._uiLocale, 'save')} title=${t(this._uiLocale, 'save')}
        @click=${() => { void this._save(); }}
      >${icon('save')}<span class="label">${t(this._uiLocale, 'save')}</span></button>`;
    }
    if (a === 'json') {
      return html`<button
        type="button" data-action="json"
        aria-label="JSON" title="JSON"
        @click=${() => this._exportJson()}
      >${icon('json')}<span class="label">JSON</span></button>`;
    }
    if (a === 'preview') {
      return html`<button
        type="button" data-action="preview" class="icon-only"
        aria-label=${t(this._uiLocale, 'preview')} title=${t(this._uiLocale, 'preview')}
        @click=${() => this.dispatchEvent(new CustomEvent('request-preview'))}
      >${icon('eye')}</button>`;
    }
    return nothing;
  }

  override render(): unknown {
    const contentWidthMm = this._pageContentWidthMm();
    const widthPx = contentWidthMm * MM_TO_PX;
    const heightPx = this._canvasHeightPx();
    const zoomOrigin = this._canvasDir === 'rtl' ? 'top right' : 'top left';
    const startIcon = this._uiDir === 'rtl' ? 'chevronRight' : 'chevronLeft';
    return html`
      <aside class="left ${this._leftCollapsed ? 'collapsed' : ''}">
        <div class="panel-head">
          <span class="title">${this._schema.meta.name}</span>
          <button type="button" class="collapse" data-control="toggle-left" aria-label=${t(this._uiLocale, this._leftCollapsed ? 'show' : 'hide')} @click=${() => this._toggleLeft()}>
            ${icon(this._leftCollapsed ? 'panelLeft' : startIcon)}
          </button>
        </div>
        ${this._leftCollapsed
          ? nothing
          : html`<div class="side-body">
              ${this._renderSideSection('actions', t(this._uiLocale, 'actions'), this._renderActionsSection())}
              ${this._renderSideSection('tools', t(this._uiLocale, 'toolbox'), this._renderToolboxContent())}
              ${this._renderSideSection('properties', t(this._uiLocale, 'properties'), this._renderProperties())}
            </div>`}
      </aside>

      <main class="center" @contextmenu=${this._onHostContextMenu}>
        <div class="canvas-zoom" style="width:${widthPx * this._zoom}px;height:${heightPx * this._zoom}px">
          <div class="canvas" style="width:${widthPx}px;transform:scale(${this._zoom});transform-origin:${zoomOrigin}" dir=${this._canvasDir}>
            ${BAND_KEYS.map((k) => this._renderBand(k))}
          </div>
        </div>
        ${this._renderContextMenu()}
      </main>
    `;
  }

  getSchema(): ReportSchemaV1 {
    return structuredClone(this._schema);
  }

  setSchema(schema: ReportSchemaV1): void {
    const v = validateReport(schema);
    if (!v.ok) throw new Error(v.error);
    this._replaceSchema(v.value, { resetHistory: true });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('reports-builder')) {
  customElements.define('reports-builder', ReportsBuilderElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'reports-builder': ReportsBuilderElement;
  }
}
