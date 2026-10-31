import { linePosForOrientationChange } from '../api.js';
import type { Band, ReportElement, ReportSchemaV1 } from '../api.js';
import { bandBounds, clampElementPos, clampLinePos } from '../geometry.js';
import { BAND_KEYS, type BandKey } from '../types.js';

/** Clamp line elements of `next` using the page and band sizes of `current` (the schema still on screen). */
export function schemaWithNormalizedLines(current: ReportSchemaV1, next: ReportSchemaV1): ReportSchemaV1 {
  const bands = { ...next.bands } as typeof next.bands;
  for (const key of BAND_KEYS) {
    const b = bands[key];
    if (!b) continue;
    const bounds = bandBounds(current, key);
    bands[key] = {
      ...b,
      elements: b.elements.map((e) => {
        if (e.kind !== 'line') return e;
        return { ...e, pos: clampLinePos(e, e.pos, bounds) };
      }),
    };
  }
  return { ...next, bands };
}

export function mapBand(
  schema: ReportSchemaV1,
  band: BandKey,
  updater: (b: Band) => Band,
): ReportSchemaV1 | null {
  const current = schema.bands[band];
  if (!current) return null;
  return { ...schema, bands: { ...schema.bands, [band]: updater(current) } };
}

export function applyElementPatch(
  schema: ReportSchemaV1,
  band: BandKey,
  id: string,
  patch: Partial<ReportElement>,
): ReportSchemaV1 | null {
  const current = schema.bands[band];
  if (!current) return null;
  const cur = current.elements.find((e) => e.id === id);
  let patchFinal: Partial<ReportElement> = patch;
  if (patch.pos) {
    patchFinal = {
      ...patch,
      pos: clampElementPos({ ...(cur?.pos ?? { x: 0, y: 0, w: 5, h: 4 }), ...patch.pos }, bandBounds(schema, band)),
    };
  }
  const elements = current.elements.map((e) => {
    if (e.id !== id) return e;
    let merged = { ...e, ...patchFinal } as ReportElement;
    if (merged.kind === 'line') {
      const nextOrientation = 'orientation' in patch ? (patch as { orientation?: 'horizontal' | 'vertical' }).orientation : undefined;
      if (cur?.kind === 'line' && nextOrientation && nextOrientation !== cur.orientation) {
        merged = {
          ...merged,
          pos: linePosForOrientationChange(cur.orientation, nextOrientation, merged.thickness ?? 1, merged.pos),
        };
      }
      merged = { ...merged, pos: clampLinePos(merged, merged.pos, bandBounds(schema, band)) };
    }
    return merged;
  });
  return { ...schema, bands: { ...schema.bands, [band]: { ...current, elements } } };
}

export function withReclampedRootElements(schema: ReportSchemaV1): ReportSchemaV1 {
  const bands = { ...schema.bands } as typeof schema.bands;
  for (const key of BAND_KEYS) {
    const b = bands[key];
    if (!b) continue;
    const bounds = bandBounds(schema, key);
    bands[key] = {
      ...b,
      elements: b.elements.map((e) => {
        let pos = clampElementPos(e.pos, bounds);
        if (e.kind === 'line') pos = clampLinePos(e, pos, bounds);
        return { ...e, pos };
      }),
    };
  }
  return { ...schema, bands };
}

/** Clamp moved elements against the band size from before the patch is stored. */
export function withRootBandPatch(schema: ReportSchemaV1, key: BandKey, patch: Partial<Band>): ReportSchemaV1 | null {
  const cur = schema.bands[key];
  if (key !== 'detail' && cur === undefined) return null;
  const base: Band = cur ?? { height: 10, elements: [] };
  const merged = { ...base, ...patch };
  const bounds = bandBounds(schema, key);
  const elements = merged.elements.map((e) => ({ ...e, pos: clampElementPos(e.pos, bounds) }));
  return { ...schema, bands: { ...schema.bands, [key]: { ...merged, elements } } };
}
