import type { ReportElement } from '../api.js';
import { clampElementPos, clampLinePos } from '../geometry.js';
import type { BandKey, ClampBounds } from '../types.js';
import type { ReportSchemaV1 } from '../api.js';

export interface ElementClipboard {
  band: BandKey;
  elements: ReportElement[];
  pasteCount: number;
}

export function clipboardFrom(band: BandKey, elements: readonly ReportElement[]): ElementClipboard {
  return { band, elements: structuredClone(elements) as ReportElement[], pasteCount: 0 };
}

export function pasteTargetBand(
  schema: ReportSchemaV1,
  selectedBand: BandKey | null,
  clipboardBand: BandKey,
): BandKey | null {
  const target =
    (selectedBand && schema.bands[selectedBand] ? selectedBand : null) ??
    (schema.bands[clipboardBand] ? clipboardBand : 'detail');
  if (!schema.bands[target]) return null;
  return target;
}

/** Offset grows by 5 mm on every paste. Line geometry is clamped after the generic rectangle clamp. */
export function pastedCopies(
  clipboard: ElementClipboard,
  bounds: ClampBounds,
  ids: (kind: string) => string,
): { elements: ReportElement[]; clipboard: ElementClipboard } {
  const offset = 5 * (clipboard.pasteCount + 1);
  const elements = clipboard.elements.map((src) => {
    const next = structuredClone(src) as ReportElement;
    next.id = ids(next.kind);
    next.pos = clampElementPos({ ...next.pos, x: next.pos.x + offset, y: next.pos.y + offset }, bounds);
    if (next.kind === 'line') next.pos = clampLinePos(next, next.pos, bounds);
    return next;
  });
  return { elements, clipboard: { ...clipboard, pasteCount: clipboard.pasteCount + 1 } };
}
