import type { ReportElement } from './api.js';

export type BuilderAction = 'save' | 'json' | 'preview';
export const BUILDER_DEFAULT_ACTIONS: readonly BuilderAction[] = ['save', 'json'];

export type BandKey = 'reportHeader' | 'pageHeader' | 'detail' | 'pageFooter' | 'reportFooter';
export const BAND_KEYS: readonly BandKey[] = ['reportHeader', 'pageHeader', 'detail', 'pageFooter', 'reportFooter'];

export type ResizeHandleKind = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const RESIZE_HANDLE_KINDS: readonly ResizeHandleKind[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export const LINE_RESIZE_HANDLES: Record<'horizontal' | 'vertical', readonly ResizeHandleKind[]> = {
  horizontal: ['e', 'w', 'ne', 'nw', 'se', 'sw'],
  vertical: ['n', 's', 'ne', 'nw', 'se', 'sw'],
};

export type SideSectionKey = 'actions' | 'tools' | 'properties' | 'dictionary' | 'reportTree';
export type RibbonTab = 'file' | 'home' | 'insert' | 'layout' | 'page' | 'view' | 'preview';
export type PosMm = { x: number; y: number; w: number; h: number };
export type RectMm = PosMm;
export type MarqueeState = { band: BandKey; start: { x: number; y: number }; current: { x: number; y: number } };
export type ContextMenuState = { x: number; y: number; band: BandKey };

export type RichToolKind = 'html' | 'markdown';
export type ToolKind = ReportElement['kind'] | RichToolKind;

export const TOOL_KINDS: ReadonlyArray<{
  kind: ToolKind;
  labelKey:
    | 'text'
    | 'field'
    | 'image'
    | 'chart'
    | 'aggregate'
    | 'expression'
    | 'line'
    | 'box'
    | 'qr'
    | 'barcode'
    | 'html'
    | 'markdown';
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

export const MIN_BUILDER_ZOOM = 0.5;
export const MAX_BUILDER_ZOOM = 2;
export const BUILDER_ZOOM_STEP = 0.1;

export interface ClampBounds {
  maxW: number;
  maxH: number;
}
