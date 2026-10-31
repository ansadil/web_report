import type { ReportElement } from '../api.js';

export function canBringForward(elements: readonly ReportElement[], selected: ReadonlySet<string>): boolean {
  if (selected.size === 0) return false;
  for (let i = elements.length - 2; i >= 0; i--) {
    if (selected.has(elements[i]!.id) && !selected.has(elements[i + 1]!.id)) return true;
  }
  return false;
}

export function canSendBackward(elements: readonly ReportElement[], selected: ReadonlySet<string>): boolean {
  if (selected.size === 0) return false;
  for (let i = 1; i < elements.length; i++) {
    if (selected.has(elements[i]!.id) && !selected.has(elements[i - 1]!.id)) return true;
  }
  return false;
}

export function canBringToFront(elements: readonly ReportElement[], selected: ReadonlySet<string>): boolean {
  if (selected.size === 0) return false;
  const picked = elements.filter((e) => selected.has(e.id));
  const tail = elements.slice(elements.length - picked.length);
  return tail.length !== picked.length || tail.some((e, i) => e.id !== picked[i]!.id);
}

export function canSendToBack(elements: readonly ReportElement[], selected: ReadonlySet<string>): boolean {
  if (selected.size === 0) return false;
  const picked = elements.filter((e) => selected.has(e.id));
  const head = elements.slice(0, picked.length);
  return head.length !== picked.length || head.some((e, i) => e.id !== picked[i]!.id);
}

export function bringToFront(elements: readonly ReportElement[], selected: ReadonlySet<string>): ReportElement[] {
  const kept = elements.filter((e) => !selected.has(e.id));
  const picked = elements.filter((e) => selected.has(e.id));
  return [...kept, ...picked];
}

export function sendToBack(elements: readonly ReportElement[], selected: ReadonlySet<string>): ReportElement[] {
  const kept = elements.filter((e) => !selected.has(e.id));
  const picked = elements.filter((e) => selected.has(e.id));
  return [...picked, ...kept];
}

export function bringForward(elements: readonly ReportElement[], selected: ReadonlySet<string>): ReportElement[] {
  const next = [...elements];
  for (let i = next.length - 2; i >= 0; i--) {
    if (selected.has(next[i]!.id) && !selected.has(next[i + 1]!.id)) {
      const left = next[i + 1]!;
      const right = next[i]!;
      next[i] = left;
      next[i + 1] = right;
    }
  }
  return next;
}

export function sendBackward(elements: readonly ReportElement[], selected: ReadonlySet<string>): ReportElement[] {
  const next = [...elements];
  for (let i = 1; i < next.length; i++) {
    if (selected.has(next[i]!.id) && !selected.has(next[i - 1]!.id)) {
      const left = next[i]!;
      const right = next[i - 1]!;
      next[i - 1] = left;
      next[i] = right;
    }
  }
  return next;
}
