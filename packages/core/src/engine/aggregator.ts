import type { Row } from '@reports-web/shared';

export type AggFn = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface AggregateRequest {
  readonly key: string;
  readonly fn: AggFn;
  readonly field: string;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function aggregateOne(rows: readonly Row[], fn: AggFn, field: string): number {
  if (fn === 'count') return rows.length;
  let sum = 0;
  let count = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const v = asNumber(row[field]);
    if (v == null) continue;
    sum += v;
    count++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (fn === 'sum') return sum;
  if (fn === 'avg') return count === 0 ? 0 : sum / count;
  if (fn === 'min') return count === 0 ? 0 : min;
  if (fn === 'max') return count === 0 ? 0 : max;
  return 0;
}

export function computeAggregates(rows: readonly Row[], requests: readonly AggregateRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const req of requests) {
    out[req.key] = aggregateOne(rows, req.fn, req.field);
  }
  return out;
}

export function groupRows<T extends Row>(rows: readonly T[], key: string): Array<{ key: unknown; rows: T[] }> {
  const map = new Map<unknown, T[]>();
  for (const row of rows) {
    const k = row[key];
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return Array.from(map, ([k, r]) => ({ key: k, rows: r }));
}
