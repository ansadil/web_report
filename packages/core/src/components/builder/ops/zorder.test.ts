import { describe, expect, it } from 'vitest';
import type { ReportElement } from '../api.js';
import { bringForward, bringToFront, canBringForward, canBringToFront, canSendBackward, canSendToBack, sendBackward, sendToBack } from './zorder.js';

function el(id: string): ReportElement {
  return { id, kind: 'text', value: id, pos: { x: 0, y: 0, w: 10, h: 6 } };
}

const stack = [el('a'), el('b'), el('c')];

describe('builder z-order', () => {
  it('brings a selection forward one step without passing other selected elements', () => {
    const selected = new Set(['a', 'b']);
    expect(canBringForward(stack, selected)).toBe(true);
    expect(bringForward(stack, selected).map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(canBringForward(bringForward(stack, selected), selected)).toBe(false);
  });

  it('sends a selection backward one step', () => {
    const selected = new Set(['c']);
    expect(canSendBackward(stack, selected)).toBe(true);
    expect(sendBackward(stack, selected).map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('moves a selection to the front or back and reports when it is already there', () => {
    const selected = new Set(['a']);
    expect(canBringToFront(stack, selected)).toBe(true);
    expect(canSendToBack(stack, selected)).toBe(false);
    expect(bringToFront(stack, selected).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(sendToBack(stack, new Set(['c'])).map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(canBringToFront(bringToFront(stack, selected), selected)).toBe(false);
  });

  it('does nothing useful with an empty selection', () => {
    expect(canBringForward(stack, new Set())).toBe(false);
    expect(canSendBackward(stack, new Set())).toBe(false);
    expect(canBringToFront(stack, new Set())).toBe(false);
    expect(canSendToBack(stack, new Set())).toBe(false);
  });
});
