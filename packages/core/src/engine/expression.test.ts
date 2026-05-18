import { describe, it, expect } from 'vitest';
import { evaluate, tryEvaluate } from './expression.js';

describe('expression evaluator', () => {
  it('arithmetic precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('-2 + 3')).toBe(1);
  });

  it('comparisons', () => {
    expect(evaluate('5 > 3')).toBe(true);
    expect(evaluate('5 == 5')).toBe(true);
    expect(evaluate('5 != 5')).toBe(false);
    expect(evaluate('1 <= 1')).toBe(true);
  });

  it('logical', () => {
    expect(evaluate('true && false')).toBe(false);
    expect(evaluate('true || false')).toBe(true);
    expect(evaluate('!true')).toBe(false);
  });

  it('ternary', () => {
    expect(evaluate('5 > 3 ? "yes" : "no"')).toBe('yes');
    expect(evaluate('0 ? "y" : "n"')).toBe('n');
  });

  it('row field access', () => {
    expect(evaluate('amount * 2', { row: { amount: 21 } })).toBe(42);
    expect(evaluate('user.name', { row: { user: { name: 'Sami' } } })).toBe('Sami');
  });

  it('now() and today()', () => {
    const fixed = new Date('2024-01-10T15:00:00Z');
    const n = evaluate('now()', { vars: { printedAt: fixed } });
    expect(n).toBeInstanceOf(Date);
    expect((n as Date).getTime()).toBe(fixed.getTime());
    const t = evaluate('today()', { vars: { printedAt: fixed } }) as Date;
    expect(t.getHours()).toBe(0);
    expect(t.getMinutes()).toBe(0);
  });

  it('builtin functions', () => {
    expect(evaluate('abs(-7)')).toBe(7);
    expect(evaluate('round(2.7)')).toBe(3);
    expect(evaluate('upper("abc")')).toBe('ABC');
    expect(evaluate('concat("a","-","b")')).toBe('a-b');
    expect(evaluate('len("hello")')).toBe(5);
    expect(evaluate('if(1 > 0, "y", "n")')).toBe('y');
    expect(evaluate('coalesce(null, "fallback")')).toBe('fallback');
  });

  it('aggregate access', () => {
    expect(evaluate('total / count', { aggregates: { total: 100, count: 4 } })).toBe(25);
  });

  it('string concat with +', () => {
    expect(evaluate('"hello " + name', { row: { name: 'world' } })).toBe('hello world');
  });

  it('returns undefined for missing field', () => {
    expect(evaluate('missing', { row: {} })).toBeUndefined();
  });

  it('rejects unknown function', () => {
    const r = tryEvaluate('unknownFn(1)');
    expect(r.ok).toBe(false);
  });

  it('rejects unterminated string', () => {
    const r = tryEvaluate('"hello');
    expect(r.ok).toBe(false);
  });

  it('caches AST and remains correct after many evals', () => {
    for (let i = 0; i < 10; i++) {
      expect(evaluate('a + b', { row: { a: i, b: 1 } })).toBe(i + 1);
    }
  });

  it('handles division by zero as NaN', () => {
    expect(Number.isNaN(evaluate('1/0') as number)).toBe(true);
  });

  it('chained member access on null safely', () => {
    expect(evaluate('a.b', { row: { a: null } })).toBeUndefined();
  });
});
