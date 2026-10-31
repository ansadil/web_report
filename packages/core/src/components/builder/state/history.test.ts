import { describe, expect, it } from 'vitest';
import type { ReportSchemaV1 } from '../api.js';
import { HISTORY_LIMIT, HistoryStore } from './history.js';

function schema(name: string): ReportSchemaV1 {
  return { meta: { name } } as unknown as ReportSchemaV1;
}

describe('builder history', () => {
  it('undo and redo restore snapshots and a new edit clears redo', () => {
    let touches = 0;
    const history = new HistoryStore(() => {
      touches++;
    });
    const a = schema('A');
    const b = schema('B');
    const c = schema('C');
    history.pushCheckpoint(a);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    const undone = history.takeUndo(b);
    expect(undone?.meta.name).toBe('A');
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    const redone = history.takeRedo(a);
    expect(redone?.meta.name).toBe('B');
    history.pushCheckpoint(b);
    expect(history.canRedo).toBe(false);
    expect(history.takeUndo(c)?.meta.name).toBe('B');
    expect(touches).toBe(2);
  });

  it('does not mutate the live schema that was checkpointed', () => {
    const history = new HistoryStore(() => undefined);
    const live = schema('Live');
    history.pushCheckpoint(live);
    live.meta.name = 'Changed';
    expect(history.takeUndo(schema('Now'))?.meta.name).toBe('Live');
  });

  it('keeps at most HISTORY_LIMIT undo entries', () => {
    const history = new HistoryStore(() => undefined);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history.pushCheckpoint(schema(`s${i}`));
    expect(history.undoDepth).toBe(HISTORY_LIMIT);
    expect(history.takeUndo(schema('current'))?.meta.name).toBe(`s${HISTORY_LIMIT + 4}`);
  });

  it('reset drops both stacks', () => {
    let touches = 0;
    const history = new HistoryStore(() => {
      touches++;
    });
    history.pushCheckpoint(schema('A'));
    history.takeUndo(schema('B'));
    history.reset();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.takeUndo(schema('C'))).toBeNull();
    expect(history.takeRedo(schema('C'))).toBeNull();
    expect(touches).toBe(2);
  });
});
