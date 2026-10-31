import { describe, expect, it } from 'vitest';
import type { ReportElement, ReportSchemaV1 } from '../api.js';
import { clipboardFrom, pastedCopies, pasteTargetBand } from './clipboard.js';

function text(id: string, x: number, y: number): ReportElement {
  return { id, kind: 'text', value: id, pos: { x, y, w: 20, h: 8 } };
}

describe('builder clipboard', () => {
  it('pastes copies offset by 5 mm and advances the paste count', () => {
    const clip = clipboardFrom('detail', [text('a', 1, 2), text('b', 4, 5)]);
    const first = pastedCopies(clip, { maxW: 180, maxH: 40 }, (kind) => `${kind}-new`);
    expect(first.elements.map((e) => e.id)).toEqual(['text-new', 'text-new']);
    expect(first.elements[0]!.pos).toMatchObject({ x: 6, y: 7 });
    expect(first.elements[1]!.pos).toMatchObject({ x: 9, y: 10 });
    expect(first.clipboard.pasteCount).toBe(1);
    const second = pastedCopies(first.clipboard, { maxW: 180, maxH: 40 }, () => 'id');
    expect(second.elements[0]!.pos).toMatchObject({ x: 11, y: 12 });
    expect(second.clipboard.pasteCount).toBe(2);
  });

  it('does not alias the source elements', () => {
    const source = text('a', 0, 0);
    const clip = clipboardFrom('detail', [source]);
    source.pos.x = 9;
    expect(clip.elements[0]!.pos.x).toBe(0);
  });

  it('chooses the selected band, then the clipboard band, then detail', () => {
    const schema = {
      bands: {
        pageHeader: { height: 12, elements: [] },
        detail: { height: 10, elements: [] },
      },
    } as unknown as ReportSchemaV1;
    expect(pasteTargetBand(schema, 'pageHeader', 'detail')).toBe('pageHeader');
    expect(pasteTargetBand(schema, null, 'pageHeader')).toBe('pageHeader');
    expect(pasteTargetBand(schema, 'reportFooter', 'reportFooter')).toBe('detail');
    const noDetail = { bands: {} } as unknown as ReportSchemaV1;
    expect(pasteTargetBand(noDetail, null, 'detail')).toBeNull();
  });
});
