import type { Band, Group, ReportElement, ReportSchemaV1, Watermark } from '../api.js';
import { logger } from '../api.js';
import { newId } from '../ids.js';
import { bandBounds, clampElementPos, clampZoom } from '../geometry.js';
import { clipboardFrom, pastedCopies, pasteTargetBand } from './clipboard.js';
import {
  applyElementPatch,
  mapBand,
  schemaWithNormalizedLines,
  withReclampedRootElements,
  withRootBandPatch,
} from './elements.js';
import {
  bringForward as bringForwardOrder,
  bringToFront as bringToFrontOrder,
  canBringForward,
  canSendBackward,
  sendBackward as sendBackwardOrder,
  sendToBack as sendToBackOrder,
} from './zorder.js';
import type { BuilderSession } from '../session.js';
import { emptySelection, type SelectionState } from '../state/selection.js';
import {
  BUILDER_ZOOM_STEP,
  type BandKey,
  type BuilderAction,
  type SideSectionKey,
} from '../types.js';

export function applySelection(session: BuilderSession, sel: SelectionState): void {
  session.selectedIds = sel.ids;
  session.selectedBand = sel.band;
  session.selectionAnchorId = sel.anchorId;
}

export function clearSelection(session: BuilderSession): void {
  applySelection(session, emptySelection());
}

export function commitSchema(session: BuilderSession, next: ReportSchemaV1, opts: { history?: boolean } = {}): void {
  if (opts.history !== false) session.history.pushCheckpoint(session.schema);
  session.schema = next;
}

export function replaceSchema(session: BuilderSession, next: ReportSchemaV1, opts: { resetHistory?: boolean } = {}): void {
  session.schema = schemaWithNormalizedLines(session.schema, next);
  if (opts.resetHistory) session.history.reset();
}

export function updateBand(
  session: BuilderSession,
  band: BandKey,
  updater: (b: Band) => Band,
  opts: { history?: boolean } = {},
): void {
  const next = mapBand(session.schema, band, updater);
  if (!next) return;
  commitSchema(session, next, opts);
}

export function updateElement(
  session: BuilderSession,
  band: BandKey,
  id: string,
  patch: Partial<ReportElement>,
  opts: { history?: boolean } = {},
): void {
  const next = applyElementPatch(session.schema, band, id, patch);
  if (!next) return;
  commitSchema(session, next, opts);
}

export function performUndo(session: BuilderSession): void {
  const prev = session.history.takeUndo(session.schema);
  if (!prev) return;
  clearSelection(session);
  session.schema = schemaWithNormalizedLines(session.schema, prev);
  session.touchHistory();
}

export function performRedo(session: BuilderSession): void {
  const next = session.history.takeRedo(session.schema);
  if (!next) return;
  clearSelection(session);
  session.schema = schemaWithNormalizedLines(session.schema, next);
  session.touchHistory();
}

export function deleteSelected(session: BuilderSession): void {
  if (!session.selectedBand || session.selectedIds.size === 0) return;
  const band = session.selectedBand;
  const rm = session.selectedIds;
  updateBand(session, band, (b) => ({ ...b, elements: b.elements.filter((e) => !rm.has(e.id)) }));
  clearSelection(session);
}

/** Move selected elements by arrow keys. Returns false when the key is not an arrow or nothing is selected. */
export function nudgeSelected(session: BuilderSession, ev: { key: string; shiftKey: boolean }): boolean {
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
      dx = session.canvasDir === 'rtl' ? 1 : -1;
      break;
    case 'ArrowRight':
      dx = session.canvasDir === 'rtl' ? -1 : 1;
      break;
    default:
      return false;
  }
  if (!session.selectedBand || session.selectedIds.size === 0) return false;
  const step = ev.shiftKey ? 5 : 1;
  const band = session.selectedBand;
  const ids = session.selectedIds;
  updateBand(session, band, (b) => ({
    ...b,
    elements: b.elements.map((el) => {
      if (!ids.has(el.id)) return el;
      const pos = clampElementPos({ ...el.pos, x: el.pos.x + dx * step, y: el.pos.y + dy * step }, bandBounds(session.schema, band));
      return { ...el, pos };
    }),
  }));
  return true;
}

export function selectedElements(session: BuilderSession): ReportElement[] {
  if (!session.selectedBand || session.selectedIds.size === 0) return [];
  const selected = session.selectedIds;
  return (session.schema.bands[session.selectedBand]?.elements ?? []).filter((e) => selected.has(e.id));
}

export function copySelected(session: BuilderSession): boolean {
  if (!session.selectedBand) return false;
  const elements = selectedElements(session);
  if (elements.length === 0) return false;
  session.clipboard = clipboardFrom(session.selectedBand, elements);
  return true;
}

export function cutSelected(session: BuilderSession): boolean {
  if (!copySelected(session)) return false;
  deleteSelected(session);
  return true;
}

export function pasteClipboard(session: BuilderSession): boolean {
  const clip = session.clipboard;
  if (!clip || clip.elements.length === 0) return false;
  const target = pasteTargetBand(session.schema, session.selectedBand, clip.band);
  if (!target) return false;
  const pasted = pastedCopies(clip, bandBounds(session.schema, target), newId);
  updateBand(session, target, (b) => ({ ...b, elements: [...b.elements, ...pasted.elements] }));
  session.selectedBand = target;
  session.selectedIds = new Set(pasted.elements.map((e) => e.id));
  session.selectionAnchorId = pasted.elements[0]?.id ?? null;
  session.clipboard = pasted.clipboard;
  return true;
}

function selectedInBand(session: BuilderSession): { band: BandKey; elements: ReportElement[]; selected: ReadonlySet<string> } | null {
  if (!session.selectedBand || session.selectedIds.size === 0) return null;
  const band = session.selectedBand;
  return { band, elements: session.schema.bands[band]?.elements ?? [], selected: session.selectedIds };
}

export function bringSelectionToFront(session: BuilderSession): void {
  const cur = selectedInBand(session);
  if (!cur) return;
  updateBand(session, cur.band, (b) => ({ ...b, elements: bringToFrontOrder(b.elements, cur.selected) }));
}

export function sendSelectionToBack(session: BuilderSession): void {
  const cur = selectedInBand(session);
  if (!cur) return;
  updateBand(session, cur.band, (b) => ({ ...b, elements: sendToBackOrder(b.elements, cur.selected) }));
}

export function bringSelectionForward(session: BuilderSession): void {
  const cur = selectedInBand(session);
  if (!cur || !canBringForward(cur.elements, cur.selected)) return;
  updateBand(session, cur.band, (b) => ({ ...b, elements: bringForwardOrder(b.elements, cur.selected) }));
}

export function sendSelectionBackward(session: BuilderSession): void {
  const cur = selectedInBand(session);
  if (!cur || !canSendBackward(cur.elements, cur.selected)) return;
  updateBand(session, cur.band, (b) => ({ ...b, elements: sendBackwardOrder(b.elements, cur.selected) }));
}

export function reclampAllRootBandElements(session: BuilderSession): void {
  commitSchema(session, withReclampedRootElements(session.schema), { history: false });
}

export function patchRootBand(session: BuilderSession, key: BandKey, patch: Partial<Band>): void {
  const next = withRootBandPatch(session.schema, key, patch);
  if (!next) return;
  commitSchema(session, next);
}

const OPTIONAL_BAND_HEIGHTS: Record<Exclude<BandKey, 'detail'>, number> = {
  reportHeader: 18,
  pageHeader: 12,
  pageFooter: 10,
  reportFooter: 16,
};

export function enableRootBand(session: BuilderSession, key: Exclude<BandKey, 'detail'>): void {
  commitSchema(session, {
    ...session.schema,
    bands: { ...session.schema.bands, [key]: { height: OPTIONAL_BAND_HEIGHTS[key], elements: [] } },
  });
  logger.info('reports-builder', 'enabled root band', { band: key });
}

export function disableRootBand(session: BuilderSession, key: Exclude<BandKey, 'detail'>): void {
  if (session.selectedBand === key) clearSelection(session);
  commitSchema(session, { ...session.schema, bands: { ...session.schema.bands, [key]: undefined } });
  logger.info('reports-builder', 'removed root band', { band: key });
}

export function patchGroupAt(session: BuilderSession, idx: number, patch: Partial<Group>): void {
  const next = [...session.schema.groups];
  const prev = next[idx];
  if (!prev) return;
  next[idx] = { ...prev, ...patch };
  commitSchema(session, { ...session.schema, groups: next });
}

export function patchGroupBandAt(session: BuilderSession, idx: number, slot: 'header' | 'footer', patch: Partial<Band>): void {
  const g = session.schema.groups[idx];
  if (!g) return;
  const cur = g[slot];
  const base: Band = cur ?? { height: 8, elements: [] };
  patchGroupAt(session, idx, { [slot]: { ...base, ...patch } });
}

export function setGroupBandAt(session: BuilderSession, idx: number, slot: 'header' | 'footer', band: Band | undefined): void {
  patchGroupAt(session, idx, { [slot]: band });
  logger.info('reports-builder', 'group band changed', { slot, idx, active: Boolean(band) });
}

export function setWatermark(session: BuilderSession, next: Watermark | undefined): void {
  commitSchema(session, {
    ...session.schema,
    ...(next
      ? { watermark: next }
      : (() => {
          const { watermark: _w, ...rest } = session.schema;
          return rest;
        })()),
  });
}

export function addCondRule(session: BuilderSession, el: ReportElement): void {
  const next = [...(el.cond ?? []), { when: 'true', style: { color: '#111111' } }];
  updateElement(session, session.selectedBand!, el.id, { cond: next });
}

export function setZoom(session: BuilderSession, value: number): void {
  session.zoom = clampZoom(value);
}

export function zoomIn(session: BuilderSession): void {
  setZoom(session, session.zoom + BUILDER_ZOOM_STEP);
}

export function zoomOut(session: BuilderSession): void {
  setZoom(session, session.zoom - BUILDER_ZOOM_STEP);
}

export function zoomReset(session: BuilderSession): void {
  setZoom(session, 1);
}

export function toggleLeft(session: BuilderSession): void {
  session.leftCollapsed = !session.leftCollapsed;
}

export function toggleMenu(session: BuilderSession): void {
  session.menuOpen = !session.menuOpen;
}

export function toggleSection(session: BuilderSession, key: SideSectionKey): void {
  session.collapsedSections = { ...session.collapsedSections, [key]: !session.collapsedSections[key] };
}

export function toggleAction(session: BuilderSession, a: BuilderAction): void {
  const current = new Set(session.actions);
  if (current.has(a)) current.delete(a);
  else current.add(a);
  session.actions = ['save', 'json', 'preview'].filter((x) => current.has(x as BuilderAction)) as readonly BuilderAction[];
}

export function closeContextMenu(session: BuilderSession): void {
  if (session.contextMenu) session.contextMenu = null;
}

export function openContextMenu(
  session: BuilderSession,
  x: number,
  y: number,
  band: BandKey,
  opts: { clearSelection?: boolean } = {},
): void {
  session.selectedBand = band;
  if (opts.clearSelection) {
    session.selectedIds = new Set();
    session.selectionAnchorId = null;
  }
  session.contextMenu = { x, y, band };
  session.focus();
}

export function openElementContextMenu(session: BuilderSession, ev: MouseEvent, band: BandKey, id: string): void {
  ev.preventDefault();
  ev.stopPropagation();
  if (session.selectedBand !== band || !session.selectedIds.has(id)) {
    session.selectedBand = band;
    session.selectedIds = new Set([id]);
    session.selectionAnchorId = id;
  }
  openContextMenu(session, ev.clientX, ev.clientY, band);
}

export function openBandContextMenu(session: BuilderSession, ev: MouseEvent, band: BandKey): void {
  ev.preventDefault();
  ev.stopPropagation();
  openContextMenu(session, ev.clientX, ev.clientY, band, { clearSelection: true });
}
