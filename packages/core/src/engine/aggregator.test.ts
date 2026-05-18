import { describe, it, expect } from 'vitest';
import { computeAggregates, groupRows } from './aggregator.js';

const rows = [
  { region: 'N', amount: 100 },
  { region: 'N', amount: 200 },
  { region: 'S', amount: 50 },
  { region: 'S', amount: 75 },
  { region: 'N', amount: 'x' },
];

describe('aggregator', () => {
  it('sum ignores non-numeric', () => {
    expect(computeAggregates(rows, [{ key: 't', fn: 'sum', field: 'amount' }]).t).toBe(425);
  });
  it('count counts all rows', () => {
    expect(computeAggregates(rows, [{ key: 'c', fn: 'count', field: 'amount' }]).c).toBe(5);
  });
  it('avg uses numeric only', () => {
    expect(computeAggregates(rows, [{ key: 'a', fn: 'avg', field: 'amount' }]).a).toBeCloseTo(425 / 4);
  });
  it('min and max', () => {
    const a = computeAggregates(rows, [
      { key: 'lo', fn: 'min', field: 'amount' },
      { key: 'hi', fn: 'max', field: 'amount' },
    ]);
    expect(a.lo).toBe(50);
    expect(a.hi).toBe(200);
  });
  it('handles empty input', () => {
    const a = computeAggregates([], [
      { key: 's', fn: 'sum', field: 'x' },
      { key: 'a', fn: 'avg', field: 'x' },
    ]);
    expect(a.s).toBe(0);
    expect(a.a).toBe(0);
  });
});

describe('groupRows', () => {
  it('groups by key preserving insertion order', () => {
    const g = groupRows(rows, 'region');
    expect(g.length).toBe(2);
    expect(g[0]?.key).toBe('N');
    expect(g[0]?.rows.length).toBe(3);
    expect(g[1]?.key).toBe('S');
    expect(g[1]?.rows.length).toBe(2);
  });
});
