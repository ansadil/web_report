import { describe, expect, it } from 'vitest';
import {
  emptySelection,
  extendSelectionRange,
  selectElementsInRect,
  selectOnly,
  toggleSelection,
} from './selection.js';

const elements = [
  { id: 'a', pos: { x: 0, y: 0, w: 10, h: 8 } },
  { id: 'b', pos: { x: 20, y: 0, w: 10, h: 8 } },
  { id: 'c', pos: { x: 40, y: 12, w: 10, h: 8 } },
];

describe('builder selection', () => {
  it('starts empty and can select a single element', () => {
    expect(emptySelection()).toEqual({ ids: new Set(), band: null, anchorId: null });
    expect(selectOnly('detail', 'a')).toEqual({ ids: new Set(['a']), band: 'detail', anchorId: 'a' });
  });

  it('toggles within a band and replaces the selection across bands', () => {
    const first = selectOnly('detail', 'a');
    const both = toggleSelection(first, 'detail', 'b');
    expect([...both.ids]).toEqual(['a', 'b']);
    expect(both.anchorId).toBe('b');
    const cleared = toggleSelection(both, 'detail', 'a');
    const gone = toggleSelection(cleared, 'detail', 'b');
    expect(gone.ids.size).toBe(0);
    expect(gone.band).toBeNull();
    const otherBand = toggleSelection(first, 'pageHeader', 'c');
    expect(otherBand).toEqual({ ids: new Set(['c']), band: 'pageHeader', anchorId: 'c' });
  });

  it('extends a shift-range in document order and falls back when the anchor is gone', () => {
    const range = extendSelectionRange(elements, 'a', 'c');
    expect([...range.ids]).toEqual(['a', 'b', 'c']);
    expect(range.anchorId).toBe('a');
    const missing = extendSelectionRange(elements, 'missing', 'b');
    expect([...missing.ids]).toEqual(['b']);
    expect(missing.anchorId).toBe('b');
  });

  it('selects every element intersecting the marquee', () => {
    const hit = selectElementsInRect(elements, 'detail', { x: 0, y: 0, w: 32, h: 8 });
    expect([...hit.ids]).toEqual(['a', 'b']);
    expect(hit.band).toBe('detail');
    expect(hit.anchorId).toBe('a');
    const none = selectElementsInRect(elements, 'detail', { x: 100, y: 100, w: 2, h: 2 });
    expect(none.band).toBeNull();
    expect(none.ids.size).toBe(0);
  });
});
