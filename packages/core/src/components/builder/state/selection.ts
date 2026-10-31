import type { BandKey, RectMm } from '../types.js';
import { rectsIntersect } from '../geometry.js';

export interface SelectionState {
  ids: ReadonlySet<string>;
  band: BandKey | null;
  anchorId: string | null;
}

export function emptySelection(): SelectionState {
  return { ids: new Set(), band: null, anchorId: null };
}

export function selectOnly(band: BandKey, id: string): SelectionState {
  return { ids: new Set([id]), band, anchorId: id };
}

/** Ctrl/Cmd click. A different band replaces the selection; the same band toggles. */
export function toggleSelection(current: SelectionState, band: BandKey, id: string): SelectionState {
  if (current.band !== band) return selectOnly(band, id);
  const next = new Set(current.ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  if (next.size === 0) return emptySelection();
  return { ids: next, band, anchorId: id };
}

/** Shift+click range in document order. A missing anchor selects only `id`. */
export function extendSelectionRange(
  elements: readonly { id: string }[],
  anchorId: string | null,
  id: string,
): { ids: ReadonlySet<string>; anchorId: string } {
  const ia = anchorId ? elements.findIndex((e) => e.id === anchorId) : -1;
  const ib = elements.findIndex((e) => e.id === id);
  if (anchorId == null || ia < 0 || ib < 0) return { ids: new Set([id]), anchorId: id };
  const lo = Math.min(ia, ib);
  const hi = Math.max(ia, ib);
  const ids = new Set<string>();
  for (let i = lo; i <= hi; i++) ids.add(elements[i]!.id);
  return { ids, anchorId };
}

export function selectElementsInRect(
  elements: readonly { id: string; pos: RectMm }[],
  band: BandKey,
  rect: RectMm,
): SelectionState {
  const ids = elements.filter((el) => rectsIntersect(rect, el.pos)).map((el) => el.id);
  return {
    band: ids.length > 0 ? band : null,
    ids: new Set(ids),
    anchorId: ids[0] ?? null,
  };
}
