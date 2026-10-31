import type { ReportElement } from '../api.js';
import { bandBounds, clampElementPos, clampLinePos } from '../geometry.js';
import type { BuilderSession } from '../session.js';
import type { BandKey } from '../types.js';
import { updateBand } from './commands.js';

export type ArrangeMode =
  | 'start'
  | 'center'
  | 'end'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute-h'
  | 'distribute-v'
  | 'same-width'
  | 'same-height'
  | 'same-size';

type Pos = ReportElement['pos'];

function placed(el: ReportElement, pos: Pos, session: BuilderSession, band: BandKey): Pos {
  const bounds = bandBounds(session.schema, band);
  return el.kind === 'line' ? clampLinePos(el, pos, bounds) : clampElementPos(pos, bounds);
}

/** New positions for the selected elements. Pure. */
export function arrangedPositions(elements: readonly ReportElement[], selectedIds: ReadonlySet<string>, mode: ArrangeMode): Map<string, Pos> {
  const selected = elements.filter((el) => selectedIds.has(el.id));
  const next = new Map<string, Pos>();
  if (selected.length === 0) return next;
  const minX = Math.min(...selected.map((el) => el.pos.x));
  const maxR = Math.max(...selected.map((el) => el.pos.x + el.pos.w));
  const minY = Math.min(...selected.map((el) => el.pos.y));
  const maxB = Math.max(...selected.map((el) => el.pos.y + el.pos.h));
  const midX = (minX + maxR) / 2;
  const midY = (minY + maxB) / 2;

  if (mode === 'distribute-h' || mode === 'distribute-v') {
    if (selected.length < 3) return next;
    const horizontal = mode === 'distribute-h';
    const sorted = [...selected].sort((a, b) => (horizontal ? a.pos.x - b.pos.x : a.pos.y - b.pos.y));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const span = horizontal ? last.pos.x + last.pos.w - first.pos.x : last.pos.y + last.pos.h - first.pos.y;
    const total = sorted.reduce((sum, el) => sum + (horizontal ? el.pos.w : el.pos.h), 0);
    const gap = (span - total) / (sorted.length - 1);
    let cursor = horizontal ? first.pos.x : first.pos.y;
    for (const el of sorted) {
      next.set(el.id, horizontal ? { ...el.pos, x: cursor } : { ...el.pos, y: cursor });
      cursor += (horizontal ? el.pos.w : el.pos.h) + gap;
    }
    return next;
  }

  if (mode === 'same-width' || mode === 'same-height' || mode === 'same-size') {
    if (selected.length < 2) return next;
    const source = selected[0]!;
    for (const el of selected) {
      next.set(el.id, {
        ...el.pos,
        w: mode === 'same-height' ? el.pos.w : source.pos.w,
        h: mode === 'same-width' ? el.pos.h : source.pos.h,
      });
    }
    return next;
  }

  if (selected.length < 2) return next;
  for (const el of selected) {
    const pos = { ...el.pos };
    if (mode === 'start') pos.x = minX;
    if (mode === 'end') pos.x = maxR - el.pos.w;
    if (mode === 'center') pos.x = midX - el.pos.w / 2;
    if (mode === 'top') pos.y = minY;
    if (mode === 'bottom') pos.y = maxB - el.pos.h;
    if (mode === 'middle') pos.y = midY - el.pos.h / 2;
    next.set(el.id, pos);
  }
  return next;
}

export function arrangeSelected(session: BuilderSession, mode: ArrangeMode): void {
  if (!session.selectedBand || session.selectedIds.size === 0) return;
  const band = session.selectedBand;
  const ids = session.selectedIds;
  updateBand(session, band, (current) => {
    const moved = arrangedPositions(current.elements, ids, mode);
    if (moved.size === 0) return current;
    return {
      ...current,
      elements: current.elements.map((el) => {
        const pos = moved.get(el.id);
        return pos ? { ...el, pos: placed(el, pos, session, band) } : el;
      }),
    };
  });
}
