import { MM_TO_PX } from '@reports-web/shared';
import type { DndController } from './interactions/dnd.js';
import type { PointerController } from './interactions/pointer.js';
import {
  addCondRule,
  bringSelectionForward,
  bringSelectionToFront,
  closeContextMenu,
  commitSchema,
  copySelected,
  cutSelected,
  deleteSelected,
  disableRootBand,
  enableRootBand,
  pasteClipboard,
  patchGroupAt,
  patchGroupBandAt,
  patchRootBand,
  performRedo,
  performUndo,
  reclampAllRootBandElements,
  sendSelectionBackward,
  sendSelectionToBack,
  setGroupBandAt,
  setWatermark,
  toggleAction,
  toggleLeft,
  toggleMenu,
  toggleSection,
  setSideTab,
  insertToolKind,
  patchSelectedStyle,
  updateElement,
  setZoom,
  zoomIn,
  zoomOut,
  zoomReset,
} from './ops/commands.js';
import { arrangeSelected } from './ops/arrange.js';
import { exportJson, newReport, openReportText, saveAsCopy, saveReport } from './ops/io.js';
import { previewExprText } from './ops/preview.js';
import { canBringForward, canBringToFront, canSendBackward, canSendToBack } from './ops/zorder.js';
import { bandPixelHeight, canvasHeightPx, pageContentWidthMm } from './geometry.js';
import { BAND_HEAD_PX } from './metrics.js';
import { elementStatusName } from './status-bar.js';
import { BAND_KEYS } from './types.js';
import type { BuilderViewCallbacks, BuilderViewState } from './render/model.js';
import type { BuilderSession } from './session.js';

export interface InteractionPorts {
  pointer: PointerController;
  dnd: DndController;
}

export function buildViewModel(session: BuilderSession, ports: InteractionPorts): { state: BuilderViewState; cb: BuilderViewCallbacks } {
  const locale = session.uiLocale;
  const digits = session.schema.meta.pageNumberDigits ?? 'locale';
  const widthMm = pageContentWidthMm(session.schema.page);
  const widthPx = widthMm * MM_TO_PX;
  const bandHeightsMm = BAND_KEYS.flatMap((key) => {
    const band = session.schema.bands[key];
    if (!band) return [];
    const own = key === 'detail' ? [0, band.height] : [band.height];
    if (key !== 'detail') return own;
    return [...own, ...session.schema.groups.flatMap((group) => (group.footer ? [group.footer.height] : []))];
  });
  const heightMm = bandHeightsMm.reduce((sum, height) => sum + height, 0);
  const groupFooterPx = session.schema.groups.reduce((sum, group) => sum + (group.footer ? bandPixelHeight(group.footer) : 0), 0);
  const heightPx = canvasHeightPx(session.schema.bands) + groupFooterPx + bandHeightsMm.length * BAND_HEAD_PX;
  const selectedOnly = session.selectedIds.size === 1 && session.selectedBand
    ? session.schema.bands[session.selectedBand]?.elements.find((el) => session.selectedIds.has(el.id))
    : undefined;
  const menu = session.contextMenu;
  const hasSelection = session.selectedIds.size > 0;
  const canLayer = hasSelection && Boolean(session.selectedBand);
  const layerElements = session.selectedBand ? (session.schema.bands[session.selectedBand]?.elements ?? []) : [];
  const run = (fn: () => void) => () => {
    fn();
    closeContextMenu(session);
  };

  const state: BuilderViewState = {
    uiLocale: locale,
    uiDir: session.uiDir,
    canvasDir: session.canvasDir,
    leftCollapsed: session.leftCollapsed,
    sideTab: session.sideTab,
    name: session.schema.meta.name,
    widthPx,
    heightPx,
    zoom: session.zoom,
    widthMm,
    heightMm,
    bandHeightsMm,
    collapsed: session.collapsedSections,
    ribbon: {
      locale,
      dir: session.uiDir,
      digits,
      tab: session.ribbonTab,
      actions: {
        locale,
        name: session.schema.meta.name,
        canUndo: session.history.canUndo,
        canRedo: session.history.canRedo,
        zoom: session.zoom,
        digits,
        actions: session.actions,
        menuOpen: session.menuOpen,
      },
      canCut: hasSelection,
      canPaste: Boolean(session.clipboard?.elements.length),
      canBringToFront: canLayer && canBringToFront(layerElements, session.selectedIds),
      canBringForward: canLayer && canBringForward(layerElements, session.selectedIds),
      canSendToBack: canLayer && canSendToBack(layerElements, session.selectedIds),
      canSendBackward: canLayer && canSendBackward(layerElements, session.selectedIds),
      selectionCount: session.selectedIds.size,
      font: {
        enabled: Boolean(selectedOnly),
        family: selectedOnly?.style?.font ?? '',
        size: selectedOnly?.style?.fontSize ?? 10,
        bold: Boolean(selectedOnly?.style?.bold),
        italic: Boolean(selectedOnly?.style?.italic),
        underline: Boolean(selectedOnly?.style?.underline),
        strike: Boolean(selectedOnly?.style?.strike),
        color: selectedOnly?.style?.color ?? '#111111',
        highlight: selectedOnly?.style?.background ?? '#f6c344',
        align: selectedOnly?.style?.align ?? '',
      },
    },
    status: {
      locale,
      digits,
      zoom: session.zoom,
      cursor: session.cursorMm,
      selection: selectedOnly ? { name: elementStatusName(selectedOnly, locale), w: selectedOnly.pos.w, h: selectedOnly.pos.h } : null,
      page: 1,
      pages: 1,
    },
    actions: {
      locale,
      name: session.schema.meta.name,
      canUndo: session.history.canUndo,
      canRedo: session.history.canRedo,
      zoom: session.zoom,
      digits,
      actions: session.actions,
      menuOpen: session.menuOpen,
    },
    toolbox: { locale, fields: session.fields },
    canvas: {
      locale,
      bands: session.schema.bands,
      groups: session.schema.groups,
      hoverBand: session.hoverBand,
      marquee: session.marquee,
      selectedIds: session.selectedIds,
      selectedBand: session.selectedBand,
    },
    properties: {
      locale,
      schema: session.schema,
      fields: session.fields,
      selectedBand: session.selectedBand,
      selectedIds: session.selectedIds,
    },
    contextMenu: menu
      ? {
          locale,
          x: menu.x,
          y: menu.y,
          hasSelection,
          canPaste: Boolean(session.clipboard?.elements.length),
          canRemoveBand: menu.band !== 'detail' && Boolean(session.schema.bands[menu.band]),
          canBringToFront: canLayer && canBringToFront(layerElements, session.selectedIds),
          canBringForward: canLayer && canBringForward(layerElements, session.selectedIds),
          canSendToBack: canLayer && canSendToBack(layerElements, session.selectedIds),
          canSendBackward: canLayer && canSendBackward(layerElements, session.selectedIds),
        }
      : null,
  };

  const cb: BuilderViewCallbacks = {
    onToggleLeft: () => toggleLeft(session),
    onSideTab: (tab) => setSideTab(session, tab),
    onToggleSection: (key) => toggleSection(session, key),
    onHostContextMenu: ports.pointer.onHostContextMenu,
    onSetZoom: (zoom) => setZoom(session, zoom),
    onCanvasPointerLeave: () => {
      session.cursorMm = null;
    },
    actions: {
      onNameInput: (value) => commitSchema(session, { ...session.schema, meta: { ...session.schema.meta, name: value } }),
      onUndo: () => performUndo(session),
      onRedo: () => performRedo(session),
      onZoomIn: () => zoomIn(session),
      onZoomOut: () => zoomOut(session),
      onZoomReset: () => zoomReset(session),
      onToggleMenu: () => toggleMenu(session),
      onToggleAction: (action) => toggleAction(session, action),
      onSave: () => {
        void saveReport(session);
      },
      onExportJson: () => exportJson(session),
      onPreview: () => {
        session.dispatchEvent(new CustomEvent('request-preview'));
      },
    },
    toolbox: {
      onToolDragStart: (ev, kind) => ports.dnd.onToolDragStart(ev, kind),
      onToolInsert: (kind) => insertToolKind(session, kind),
      onFieldDragStart: (ev, field) => ports.dnd.onFieldDragStart(ev, field),
    },
    canvas: {
      onDragOver: (ev, band) => ports.dnd.onBandDragOver(ev, band),
      onDragLeave: () => ports.dnd.onBandDragLeave(),
      onDrop: (ev, band) => ports.dnd.onBandDrop(ev, band),
      onBandContextMenu: (ev, band) => ports.pointer.onBandContextMenu(ev, band),
      onBandPointerDown: (ev, band) => ports.pointer.onBandPointerDown(ev, band),
      onElementContextMenu: (ev, band, id) => ports.pointer.onElementContextMenu(ev, band, id),
      onElementPointerDown: (ev, band, id, mode) => ports.pointer.onElementPointerDown(ev, band, id, mode),
      onBandPointerMove: (ev, band) => ports.pointer.onBandPointerMove(ev, band),
      previewExpr: (el) => previewExprText(session.schema, session.sampleRows, el),
    },
    ribbon: {
      onTab: (tab) => {
        session.ribbonTab = tab;
      },
      actions: {
        onNameInput: (value) => commitSchema(session, { ...session.schema, meta: { ...session.schema.meta, name: value } }),
        onUndo: () => performUndo(session),
        onRedo: () => performRedo(session),
        onZoomIn: () => zoomIn(session),
        onZoomOut: () => zoomOut(session),
        onZoomReset: () => zoomReset(session),
        onToggleMenu: () => toggleMenu(session),
        onToggleAction: (action) => toggleAction(session, action),
        onSave: () => {
          void saveReport(session);
        },
        onExportJson: () => exportJson(session),
        onPreview: () => {
          session.dispatchEvent(new CustomEvent('request-preview'));
        },
      },
      onCut: () => {
        cutSelected(session);
      },
      onCopy: () => {
        copySelected(session);
      },
      onPaste: () => {
        pasteClipboard(session);
      },
      onDelete: () => deleteSelected(session),
      onBringToFront: () => bringSelectionToFront(session),
      onBringForward: () => bringSelectionForward(session),
      onSendToBack: () => sendSelectionToBack(session),
      onSendBackward: () => sendSelectionBackward(session),
      onInsertDragStart: (ev, kind) => ports.dnd.onToolDragStart(ev, kind),
      onPortrait: () => {
        commitSchema(session, { ...session.schema, page: { ...session.schema.page, orientation: 'portrait' } });
        reclampAllRootBandElements(session);
      },
      onLandscape: () => {
        commitSchema(session, { ...session.schema, page: { ...session.schema.page, orientation: 'landscape' } });
        reclampAllRootBandElements(session);
      },
      onNew: () => newReport(session),
      onOpenText: (text) => openReportText(session, text),
      onSaveAs: () => saveAsCopy(session),
      onArrange: (mode) => arrangeSelected(session, mode),
      onStyle: (patch) => {
        const next = { ...patch };
        if (next.fontSize !== undefined) {
          if (!Number.isFinite(next.fontSize)) return;
          next.fontSize = Math.min(96, Math.max(4, next.fontSize));
        }
        patchSelectedStyle(session, next);
      },
    },
    properties: {
      updateMeta: (patch) => commitSchema(session, { ...session.schema, meta: { ...session.schema.meta, ...patch } }),
      updatePage: (patch) => {
        commitSchema(session, { ...session.schema, page: { ...session.schema.page, ...patch } });
        reclampAllRootBandElements(session);
      },
      updateMargins: (patch) => {
        commitSchema(session, {
          ...session.schema,
          page: { ...session.schema.page, margins: { ...session.schema.page.margins, ...patch } },
        });
        reclampAllRootBandElements(session);
      },
      patchRootBand: (key, patch) => patchRootBand(session, key, patch),
      enableRootBand: (key) => enableRootBand(session, key),
      disableRootBand: (key) => disableRootBand(session, key),
      patchGroupAt: (idx, patch) => patchGroupAt(session, idx, patch),
      patchGroupBandAt: (idx, slot, patch) => patchGroupBandAt(session, idx, slot, patch),
      setGroupBandAt: (idx, slot, band) => setGroupBandAt(session, idx, slot, band),
      setWatermark: (next) => setWatermark(session, next),
      updateElement: (band, id, patch) => updateElement(session, band, id, patch),
      deleteSelected: () => deleteSelected(session),
      addCondRule: (el) => addCondRule(session, el),
    },
    contextMenu: {
      onCut: run(() => {
        cutSelected(session);
      }),
      onCopy: run(() => {
        copySelected(session);
      }),
      onPaste: run(() => {
        pasteClipboard(session);
      }),
      onDelete: run(() => {
        deleteSelected(session);
      }),
      onRemoveSection: run(() => {
        const band = session.contextMenu?.band;
        if (band && band !== 'detail') disableRootBand(session, band);
      }),
      onBringToFront: run(() => bringSelectionToFront(session)),
      onBringForward: run(() => bringSelectionForward(session)),
      onSendToBack: run(() => sendSelectionToBack(session)),
      onSendBackward: run(() => sendSelectionBackward(session)),
    },
  };

  return { state, cb };
}
