import type { ReactiveController, ReactiveControllerHost } from 'lit';
import {
  applyResize,
  bandBounds,
  clampElementPos,
  clampLinePos,
  marqueeRect,
  pointInBand,
  scalePxToMm,
} from '../geometry.js';
import {
  applySelection,
  clearSelection,
  closeContextMenu,
  openBandContextMenu,
  openElementContextMenu,
  updateBand,
  updateElement,
} from '../ops/commands.js';
import type { BuilderSession } from '../session.js';
import {
  extendSelectionRange,
  selectElementsInRect,
  selectOnly,
  toggleSelection,
} from '../state/selection.js';
import type { BandKey, RectMm, ResizeHandleKind } from '../types.js';

export class PointerController implements ReactiveController {
  constructor(
    private readonly session: BuilderSession,
    private readonly host: HTMLElement & ReactiveControllerHost,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.host.addEventListener('contextmenu', this.onHostContextMenu, true);
    document.addEventListener('pointerdown', this.onDocPointerDown, true);
  }

  hostDisconnected(): void {
    this.host.removeEventListener('contextmenu', this.onHostContextMenu, true);
    document.removeEventListener('pointerdown', this.onDocPointerDown, true);
  }

  readonly onHostContextMenu = (ev: Event): void => {
    const path = ev.composedPath();
    if (
      path.some(
        (n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || n instanceof HTMLSelectElement,
      )
    ) {
      return;
    }
    ev.preventDefault();
  };

  private readonly onDocPointerDown = (ev: PointerEvent): void => {
    if (ev.button === 2) return;
    if (!this.session.contextMenu) return;
    const menu = this.session.shadowRoot?.querySelector('.ctx-menu');
    if (menu && ev.composedPath().includes(menu)) return;
    closeContextMenu(this.session);
  };

  onBandContextMenu(ev: MouseEvent, band: BandKey): void {
    openBandContextMenu(this.session, ev, band);
  }

  onElementContextMenu(ev: MouseEvent, band: BandKey, id: string): void {
    openElementContextMenu(this.session, ev, band, id);
  }

  onBandPointerMove(ev: PointerEvent, band: BandKey): void {
    const target = ev.currentTarget as HTMLElement;
    this.session.cursorMm = this.point(ev, target, band);
  }

  onBandPointerDown(ev: PointerEvent, band: BandKey): void {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture(ev.pointerId);
    const start = this.point(ev, target, band);
    let moved = false;
    this.session.marquee = { band, start, current: start };

    const onMove = (e: PointerEvent) => {
      const current = this.point(e, target, band);
      const next = { band, start, current };
      const rect = marqueeRect(next);
      moved = moved || rect.w >= 1 || rect.h >= 1;
      this.session.marquee = next;
      if (moved) this.selectInRect(band, rect);
    };
    const onUp = (e: PointerEvent) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.releasePointerCapture(e.pointerId);
      const finalRect = this.session.marquee ? marqueeRect(this.session.marquee) : null;
      this.session.marquee = null;
      if (moved && finalRect) this.selectInRect(band, finalRect);
      else clearSelection(this.session);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp, { once: true });
  }

  onElementPointerDown(ev: PointerEvent, band: BandKey, id: string, mode: 'move' | ResizeHandleKind): void {
    ev.stopPropagation();
    ev.preventDefault();
    const isRtl = this.session.canvasDir === 'rtl';

    if (mode !== 'move') {
      if (this.session.selectedBand !== band || this.session.selectedIds.size !== 1 || !this.session.selectedIds.has(id)) {
        applySelection(this.session, selectOnly(band, id));
      }
      const target = ev.currentTarget as HTMLElement;
      target.setPointerCapture(ev.pointerId);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const el = this.session.schema.bands[band]?.elements.find((e) => e.id === id);
      if (!el) return;
      const startPos = { ...el.pos };
      const handle = mode;
      let historyCaptured = false;
      const onMove = (e: PointerEvent) => {
        if (!historyCaptured) {
          this.session.history.pushCheckpoint(this.session.schema);
          historyCaptured = true;
        }
        const dx = scalePxToMm(e.clientX - startX, this.session.zoom);
        const dy = scalePxToMm(e.clientY - startY, this.session.zoom);
        let next = applyResize(startPos, dx, dy, handle, isRtl, bandBounds(this.session.schema, band));
        const current = this.session.schema.bands[band]?.elements.find((item) => item.id === id);
        if (current?.kind === 'line') next = clampLinePos(current, next, bandBounds(this.session.schema, band));
        updateElement(this.session, band, id, { pos: next }, { history: false });
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
      applySelection(
        this.session,
        toggleSelection(
          {
            ids: this.session.selectedIds,
            band: this.session.selectedBand,
            anchorId: this.session.selectionAnchorId,
          },
          band,
          id,
        ),
      );
      return;
    }

    if (ev.shiftKey && this.session.selectedBand === band && this.session.selectionAnchorId) {
      const els = this.session.schema.bands[band]?.elements ?? [];
      const range = extendSelectionRange(els, this.session.selectionAnchorId, id);
      this.session.selectedIds = range.ids;
      this.session.selectionAnchorId = range.anchorId;
      return;
    }

    if (!this.session.selectedIds.has(id) || this.session.selectedBand !== band) {
      applySelection(this.session, selectOnly(band, id));
    }

    const idsToMove = [...this.session.selectedIds];
    const starts = new Map(
      idsToMove.map((iid) => {
        const found = this.session.schema.bands[band]!.elements.find((x) => x.id === iid)!;
        return [iid, { ...found.pos }] as const;
      }),
    );

    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture(ev.pointerId);
    const startX = ev.clientX;
    const startY = ev.clientY;
    let historyCaptured = false;

    const onMove = (e: PointerEvent) => {
      if (!historyCaptured) {
        this.session.history.pushCheckpoint(this.session.schema);
        historyCaptured = true;
      }
      const dx = scalePxToMm(e.clientX - startX, this.session.zoom);
      const dy = scalePxToMm(e.clientY - startY, this.session.zoom);
      const rdx = isRtl ? -dx : dx;
      updateBand(
        this.session,
        band,
        (b) => ({
          ...b,
          elements: b.elements.map((item) => {
            const sp = starts.get(item.id);
            if (!sp) return item;
            const nx = sp.x + rdx;
            const ny = sp.y + dy;
            const clamped = clampElementPos(
              { ...sp, x: Math.round(nx), y: Math.round(ny) },
              bandBounds(this.session.schema, band),
            );
            return { ...item, pos: clamped };
          }),
        }),
        { history: false },
      );
    };
    const onUp = (e: PointerEvent) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.releasePointerCapture(e.pointerId);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp, { once: true });
  }

  private point(ev: PointerEvent, target: HTMLElement, band: BandKey): { x: number; y: number } {
    const rect = target.getBoundingClientRect();
    const bounds = bandBounds(this.session.schema, band);
    return pointInBand(ev, rect, {
      rtl: this.session.canvasDir === 'rtl',
      zoom: this.session.zoom,
      maxW: bounds.maxW,
      maxH: bounds.maxH,
    });
  }

  private selectInRect(band: BandKey, rect: RectMm): void {
    const elements = this.session.schema.bands[band]?.elements ?? [];
    applySelection(this.session, selectElementsInRect(elements, band, rect));
  }
}
