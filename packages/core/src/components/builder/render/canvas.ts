import type { LocaleTag } from '@reports-web/shared';
import { html, nothing } from 'lit';
import { MM_TO_PX } from '@reports-web/shared';
import { icon, t } from '../api.js';
import type { ReportElement, ReportSchemaV1 } from '../api.js';
import { builderCanvasStyleCss } from '../canvas-style.js';
import { bandPixelHeight, dataHeaderHeightMm, marqueeRect } from '../geometry.js';
import {
  BAND_KEYS,
  LINE_RESIZE_HANDLES,
  RESIZE_HANDLE_KINDS,
  type BandKey,
  type MarqueeState,
  type ResizeHandleKind,
} from '../types.js';

export interface CanvasState {
  locale: LocaleTag;
  bands: ReportSchemaV1['bands'];
  groups: ReportSchemaV1['groups'];
  fields: readonly { name: string; label?: string }[];
  hoverBand: BandKey | null;
  marquee: MarqueeState | null;
  selectedIds: ReadonlySet<string>;
  selectedBand: BandKey | null;
}

export interface CanvasCallbacks {
  onDragOver: (ev: DragEvent, band: BandKey) => void;
  onDragLeave: () => void;
  onDrop: (ev: DragEvent, band: BandKey) => void;
  onBandContextMenu: (ev: MouseEvent, band: BandKey) => void;
  onBandPointerDown: (ev: PointerEvent, band: BandKey) => void;
  onElementContextMenu: (ev: MouseEvent, band: BandKey, id: string) => void;
  onElementPointerDown: (ev: PointerEvent, band: BandKey, id: string, mode: 'move' | ResizeHandleKind) => void;
  onBandPointerMove: (ev: PointerEvent, band: BandKey) => void;
  previewExpr: (el: Extract<ReportElement, { kind: 'expr' }>) => string;
}

export function renderBands(state: CanvasState, cb: CanvasCallbacks) {
  return BAND_KEYS.flatMap((name) => {
    const band = renderBand(state, cb, name);
    if (name !== 'detail' || !state.bands.detail) return [band];
    return [renderDataHeader(state), band, ...renderGroupFooters(state, cb)];
  });
}

function bandIcon(name: string) {
  if (name === 'reportHeader') return icon('layers');
  if (name === 'pageHeader' || name === 'pageFooter') return icon('copy');
  if (name === 'dataHeader' || name === 'detail') return icon('table');
  if (name.startsWith('groupFooter') || name === 'reportFooter') return icon('hash');
  return icon('folder');
}

function bandHead(name: string, label: string) {
  return html`<div class="band-head" data-testid=${`band-head-${name}`}>
    ${bandIcon(name)}
    <span class="band-label">${label}</span>
    <button type="button" class="band-settings" data-testid=${`band-settings-${name}`} aria-label=${label} @pointerdown=${(e: Event) => e.stopPropagation()}>${icon('cog')}</button>
  </div>`;
}

function fieldCaption(state: CanvasState, name: string): string {
  return (state.fields ?? []).find((field) => field.name === name)?.label?.trim() || name;
}

function aggregateCaption(state: CanvasState, fn: 'sum' | 'count' | 'avg' | 'min' | 'max', field: string): string {
  const key = fn === 'sum' ? 'fnSum' : fn === 'count' ? 'fnCount' : fn === 'avg' ? 'fnAvg' : fn === 'min' ? 'fnMin' : 'fnMax';
  return `${t(state.locale, key)}(${fieldCaption(state, field)})`;
}

function renderDataHeader(state: CanvasState) {
  const mm = dataHeaderHeightMm(state.bands);
  const columns = (state.bands.detail?.elements ?? []).filter((el) => el.kind === 'field');
  return html`<div class="band-strip" data-band="dataHeader">
    ${bandHead('dataHeader', t(state.locale, 'dataHeader'))}
    ${mm > 0
      ? html`<div class="band" data-testid="band-data-header" style="height:${bandPixelHeight({ height: mm, elements: [] })}px">
          ${columns.map((el) => html`<div class="col-head" style="inset-inline-start:${el.pos.x * MM_TO_PX}px;top:${MM_TO_PX}px;width:${el.pos.w * MM_TO_PX}px;height:${6 * MM_TO_PX}px">${fieldCaption(state, el.field)}</div>`)}
        </div>`
      : nothing}
  </div>`;
}

function renderGroupFooters(state: CanvasState, cb: CanvasCallbacks) {
  const quiet: CanvasCallbacks = {
    ...cb,
    onElementContextMenu: (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    },
    onElementPointerDown: (ev) => {
      ev.stopPropagation();
    },
  };
  return (state.groups ?? []).flatMap((group, index) => {
    if (!group.footer) return [];
    return [html`
      <div class="band-strip" data-band="groupFooter">
        ${bandHead(`groupFooter-${index}`, t(state.locale, 'groupFooter'))}
        <div class="band" data-testid=${`band-group-footer-${index}`} style="height:${bandPixelHeight(group.footer)}px">
          ${group.footer.elements.map((el) => renderElement(state, quiet, 'detail', el))}
        </div>
      </div>
    `];
  });
}

function renderBand(state: CanvasState, cb: CanvasCallbacks, name: BandKey) {
  const band = state.bands[name];
  if (!band) return nothing;
  const dropClass = state.hoverBand === name ? 'band-drop-on' : '';
  return html`
    <div class="band-strip" data-band=${name}>
      ${bandHead(name, t(state.locale, name as 'reportHeader'))}
      <div
        class="band ${dropClass}"
        data-testid=${`band-${name}`}
        style="height:${bandPixelHeight(band)}px"
        @dragover=${(e: DragEvent) => cb.onDragOver(e, name)}
        @dragleave=${cb.onDragLeave}
        @drop=${(e: DragEvent) => cb.onDrop(e, name)}
        @contextmenu=${(e: MouseEvent) => cb.onBandContextMenu(e, name)}
        @pointerdown=${(e: PointerEvent) => cb.onBandPointerDown(e, name)}
        @pointermove=${(e: PointerEvent) => cb.onBandPointerMove(e, name)}
      >
        ${band.elements.map((el) => renderElement(state, cb, name, el))}
        ${renderMarquee(state, name)}
      </div>
    </div>
  `;
}

function renderMarquee(state: CanvasState, band: BandKey) {
  if (!state.marquee || state.marquee.band !== band) return nothing;
  const r = marqueeRect(state.marquee);
  if (r.w < 1 && r.h < 1) return nothing;
  const style = `
    inset-inline-start:${r.x * MM_TO_PX}px;
    top:${r.y * MM_TO_PX}px;
    width:${r.w * MM_TO_PX}px;
    height:${r.h * MM_TO_PX}px;
  `;
  return html`<div class="marquee" data-testid="marquee" style="${style}"></div>`;
}

function qrMark() {
  return html`<svg class="qr-mark" viewBox="0 0 7 7" aria-hidden="true"><rect width="7" height="7" fill="#fff"/><path fill="#15233a" d="M0 0h3v3H0zm4 0h3v3H4zM0 4h3v3H0zM1 1h1v1H1zm4 0h1v1H5zM1 5h1v1H1zm3-1h1v1H4zm2 1h1v1H6zM5 6h1v1H5z"/></svg>`;
}

function elementLabel(state: CanvasState, cb: CanvasCallbacks, el: Exclude<ReportElement, { kind: 'line' }>): string {
  switch (el.kind) {
    case 'text':
      return el.value;
    case 'field':
      return `[${t(state.locale, 'field')}]`;
    case 'aggregate':
      return aggregateCaption(state, el.fn, el.field);
    case 'chart':
      return `${el.type} chart`;
    case 'expr':
      return cb.previewExpr(el);
    case 'image':
      return el.alt || t(state.locale, 'image');
    case 'box':
      return '';
    case 'qr':
      return '';
    case 'barcode':
      return `${el.symbology}: ${el.value ?? el.field ?? el.expression ?? ''}`;
    case 'richtext': {
      const preview = el.content.replace(/\s+/g, ' ').trim();
      const tag = el.mode === 'markdown' ? 'markdown' : 'html';
      const text = preview.length > 48 ? `${preview.slice(0, 48)}…` : preview || `[${tag}]`;
      return `[${tag}] ${text}`;
    }
    default: {
      const _exhaustive: never = el;
      return _exhaustive;
    }
  }
}

function renderElement(state: CanvasState, cb: CanvasCallbacks, band: BandKey, el: ReportElement) {
  const isSel = state.selectedIds.has(el.id);
  const showHandles = isSel && state.selectedBand === band && state.selectedIds.size === 1;
  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      cb.onElementContextMenu(e, band, el.id);
      return;
    }
    cb.onElementPointerDown(e, band, el.id, 'move');
  };
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
        data-testid=${`element-${el.id}`}
        data-kind="line"
        data-orientation=${el.orientation}
        style=${boxStyle}
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @contextmenu=${(e: MouseEvent) => cb.onElementContextMenu(e, band, el.id)}
        @pointerdown=${onPointerDown}
      >
        ${showHandles ? html`<span class="el-name" data-testid="element-name">${t(state.locale, 'line')}</span>` : nothing}
        <div class="line-stroke" style=${strokeStyle}></div>
        ${showHandles
          ? html`<div class="resize-handles" aria-hidden="true">
              ${lineHandles.map(
                (h) => html`<div
                  class="resize-handle resize-${h}"
                  @pointerdown=${(e: PointerEvent) => {
                    e.stopPropagation();
                    cb.onElementPointerDown(e, band, el.id, h);
                  }}
                ></div>`,
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  const canvasDecor = builderCanvasStyleCss(el);
  const style = `
    inset-inline-start:${el.pos.x * MM_TO_PX}px;
    top:${el.pos.y * MM_TO_PX}px;
    width:${el.pos.w * MM_TO_PX}px;
    height:${el.pos.h * MM_TO_PX}px;
    font-size:${el.style?.fontSize ?? 10}px;
    color:${el.style?.color ?? '#111'};
    ${el.style?.background ? `background:${el.style.background};` : ''}
    ${el.style?.bold ? 'font-weight:700;' : ''}
    ${el.style?.italic ? 'font-style:italic;' : ''}
    ${el.style?.underline || el.style?.strike ? `text-decoration:${[el.style?.underline ? 'underline' : '', el.style?.strike ? 'line-through' : ''].filter(Boolean).join(' ')};` : ''}
    ${el.style?.align ? `text-align:${el.style.align};` : ''}
    ${canvasDecor ? `;${canvasDecor}` : ''}
  `;
  const label = elementLabel(state, cb, el);
  const body = el.kind === 'qr' ? qrMark() : el.kind === 'image' ? html`${icon('image')}<span>${label}</span>` : label;
  return html`
    <div
      class="element ${isSel ? 'selected' : ''} ${el.kind} ${el.style?.valign ? `valign-${el.style.valign}` : ''}"
      data-testid=${`element-${el.id}`}
      data-kind=${el.kind}
      style="${style}"
      @click=${(e: MouseEvent) => e.stopPropagation()}
      @contextmenu=${(e: MouseEvent) => cb.onElementContextMenu(e, band, el.id)}
      @pointerdown=${onPointerDown}
    >
      ${showHandles ? html`<span class="el-name" data-testid="element-name">${label}</span>` : nothing}
      <div class="el-body ${el.kind === 'richtext' ? 'element-preview' : ''}">${body}</div>
      ${showHandles
        ? html`<div class="resize-handles" aria-hidden="true">
            ${RESIZE_HANDLE_KINDS.map(
              (h) => html`<div
                class="resize-handle resize-${h}"
                @pointerdown=${(e: PointerEvent) => {
                  e.stopPropagation();
                  cb.onElementPointerDown(e, band, el.id, h);
                }}
              ></div>`,
            )}
          </div>`
        : nothing}
    </div>
  `;
}
