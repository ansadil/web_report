// @vitest-environment node
/** `exportPdf` forwards `params`, `timeZone` and `printedAt` to the interpreter (same tree as the viewer). */
import { describe, it, expect, vi } from 'vitest';

const interpretSpy = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('../engine/interpreter.js', async (orig) => {
  const mod = await orig<typeof import('../engine/interpreter.js')>();
  return {
    ...mod,
    interpret: (input: Parameters<typeof mod.interpret>[0]) => {
      interpretSpy.calls.push(input);
      return mod.interpret(input);
    },
  };
});

import { exportPdf } from './pdf.js';
import { validateReport } from '../schema/report-schema.js';

function schema() {
  const r = validateReport({
    version: '1',
    id: 'p',
    meta: { name: 'P', locale: 'en', dir: 'ltr' },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    parameters: [{ name: 'year', type: 'number' }],
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('exportPdf parameters', () => {
  it('forwards params, timeZone and printedAt', async () => {
    interpretSpy.calls.length = 0;
    const printedAt = new Date('2026-11-01T09:00:00Z');
    await exportPdf({ schema: schema(), rows: [{ x: 1 }], params: { year: 2026 }, timeZone: 'UTC', printedAt });
    expect(interpretSpy.calls.at(-1)).toMatchObject({ params: { year: 2026 }, timeZone: 'UTC', printedAt });
  });

  it('without them keeps the old call (no params variable)', async () => {
    interpretSpy.calls.length = 0;
    await exportPdf({ schema: schema(), rows: [{ x: 1 }] });
    const call = interpretSpy.calls.at(-1) as Record<string, unknown>;
    expect('params' in call).toBe(false);
    expect('timeZone' in call).toBe(false);
  });
});
