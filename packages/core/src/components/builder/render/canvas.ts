import type { LocaleTag } from '@reports-web/shared';
import { html, nothing } from 'lit';
import { MM_TO_PX } from '@reports-web/shared';
import { t } from '../api.js';
import type { ReportElement, ReportSchemaV1 } from '../api.js';
import { builderCanvasStyleCss } from '../canvas-style.js';
import { bandPixelHeight, marqueeRect } from '../geometry.js';
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
  previewExpr: (el: Extract<ReportElement, { kind: 'expr' }>) => string;
}

export function renderBands(state: CanvasState, cb: CanvasCallbacks) {
  return BAND_KEYS.map((name) => renderBand(state, cb, name));
}

function renderBand(state: CanvasState, cb: CanvasCallbacks, name: BandKey) {
  const band = state.bands[name];
  if (!band) return nothing;
  const dropClass = state.hoverBand === name ? 'band-drop-on' : '';
  return html`
    <div
      class="band ${dropClass}"
      data-testid=${`band-${name}`}
      style="height:${bandPixelHeight(band)}px"
      @dragover=${(e: DragEvent) => cb.onDragOver(e, name)}
      @dragleave=${cb.onDragLeave}
      @drop=${(e: DragEvent) => cb.onDrop(e, name)}
      @contextmenu=${(e: MouseEvent) => cb.onBandContextMenu(e, name)}
      @pointerdown=${(e: PointerEvent) => cb.onBandPointerDown(e, name)}
    >
      <span class="band-label">${t(state.locale, name as 'reportHeader')}</span>
      ${band.elements.map((el) => renderElement(state, cb, name, el))}
      ${renderMarquee(state, name)}
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

function elementLabel(state: CanvasState, cb: CanvasCallbacks, el: Exclude<ReportElement, { kind: 'line' }>): string {
  switch (el.kind) {
    case 'text':
      return el.value;
    case 'field':
      return `[${el.field}]`;
    case 'aggregate':
      return `${el.fn}(${el.field})`;
    case 'chart':
      return `${el.type} chart`;
    case 'expr':
      return cb.previewExpr(el);
    case 'image':
      return el.src ? '🖼️' : '[image]';
    case 'box':
      return '';
    case 'qr':
      return `QR: ${el.value ?? el.field ?? el.expression ?? ''}`;
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
        data-orientation=${el.orientation}
        style=${boxStyle}
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @contextmenu=${(e: MouseEvent) => cb.onElementContextMenu(e, band, el.id)}
        @pointerdown=${onPointerDown}
      >
        <span class="kind">${el.kind}</span>
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
    ${el.style?.align ? `text-align:${el.style.align === 'end' ? 'right' : el.style.align === 'center' ? 'center' : el.style.align === 'start' ? 'left' : 'justify'};` : ''}
    ${canvasDecor ? `;${canvasDecor}` : ''}
  `;
  const label = elementLabel(state, cb, el);
  return html`
    <div
      class="element ${isSel ? 'selected' : ''} ${el.kind === 'richtext' ? 'richtext' : ''}"
      data-testid=${`element-${el.id}`}
      style="${style}"
      @click=${(e: MouseEvent) => e.stopPropagation()}
      @contextmenu=${(e: MouseEvent) => cb.onElementContextMenu(e, band, el.id)}
      @pointerdown=${onPointerDown}
    >
      <span class="kind">${el.kind}</span>
      <div class="${el.kind === 'richtext' ? 'element-preview' : ''}">${label}</div>
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
