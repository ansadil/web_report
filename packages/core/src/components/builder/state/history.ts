import type { ReportSchemaV1 } from '../api.js';

export const HISTORY_LIMIT = 100;

/** Undo/redo snapshots. Callers apply schema normalization and selection changes. */
export class HistoryStore {
  private undoStack: ReportSchemaV1[] = [];
  private redoStack: ReportSchemaV1[] = [];

  constructor(private readonly touch: () => void) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  pushCheckpoint(schema: ReportSchemaV1): void {
    this.undoStack = [...this.undoStack, structuredClone(schema)].slice(-HISTORY_LIMIT);
    this.redoStack = [];
    this.touch();
  }

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.touch();
  }

  /** Returns a clone of the previous snapshot, or null when the stack is empty. Does not touch. */
  takeUndo(current: ReportSchemaV1): ReportSchemaV1 | null {
    const prev = this.undoStack.at(-1);
    if (!prev) return null;
    this.undoStack = this.undoStack.slice(0, -1);
    this.redoStack = [...this.redoStack, structuredClone(current)].slice(-HISTORY_LIMIT);
    return structuredClone(prev);
  }

  /** Returns a clone of the next snapshot, or null when the stack is empty. Does not touch. */
  takeRedo(current: ReportSchemaV1): ReportSchemaV1 | null {
    const next = this.redoStack.at(-1);
    if (!next) return null;
    this.redoStack = this.redoStack.slice(0, -1);
    this.undoStack = [...this.undoStack, structuredClone(current)].slice(-HISTORY_LIMIT);
    return structuredClone(next);
  }
}
