import { describe, expect, it } from 'vitest';
import type { ReportElement } from '../api.js';
import { arrangedPositions } from './arrange.js';

function box(id: string, x: number, y: number, w = 10, h = 10): ReportElement {
  return { id, kind: 'text', value: id, pos: { x, y, w, h } };
}

describe('arrangedPositions', () => {
  const elements = [box('a', 0, 0), box('b', 30, 5, 10, 20), box('c', 70, 40)];
  const ids = new Set(['a', 'b', 'c']);

  it('aligns the start edges and the bottom edges', () => {
    const start = arrangedPositions(elements, ids, 'start');
    expect(start.get('b')?.x).toBe(0);
    expect(start.get('c')?.x).toBe(0);
    const bottom = arrangedPositions(elements, ids, 'bottom');
    expect(bottom.get('a')?.y).toBe(40);
    expect(bottom.get('b')?.y).toBe(30);
    expect(bottom.get('c')?.y).toBe(40);
  });

  it('distributes horizontal gaps between the outer elements', () => {
    const next = arrangedPositions(elements, ids, 'distribute-h');
    expect(next.get('a')?.x).toBe(0);
    expect(next.get('c')?.x).toBe(70);
    expect(next.get('b')?.x).toBeCloseTo(35);
  });

  it('copies the first selected size', () => {
    const next = arrangedPositions(elements, ids, 'same-size');
    expect(next.get('b')).toMatchObject({ w: 10, h: 10 });
    expect(next.get('c')).toMatchObject({ w: 10, h: 10 });
  });
});
