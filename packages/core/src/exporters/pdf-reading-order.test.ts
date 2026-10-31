// @vitest-environment node
/**
 * BUG-26: pdftotext (poppler) reading order. Poppler sorts a line's fragments by their left
 * edge before joining them; with zero-width boxes for non-spacing marks / U+200B, fragments
 * of these lines sorted out of drawing order and came out scrambled (no character lost).
 * Needs `pdftotext` (poppler-utils) on PATH; the suite is skipped without it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportPdf } from './pdf.js';
import { advancelessWidth } from './pdf-render.js';
import { validateReport } from '../schema/report-schema.js';

const TASHKEEL = 'مُحَمَّدٌ وَعَلِيٌّ يَدْرُسَانِ فِي الْمَدْرَسَةِ الْكَبِيرَةِ';
const INVOICE = 'Invoice INV-2026-0042 issued to شركة الإدارة الحديثة on 15/03/2026';
/** [family, bold, dir, line, exact]: `exact` false = word order checked with spaces ignored (as on main). */
const CASES: [string, boolean, 'rtl' | 'ltr', string, boolean][] = [
  ['Tajawal', false, 'rtl', TASHKEEL, true],
  ['Tajawal', false, 'ltr', TASHKEEL, true],
  ['Noto Naskh Arabic', false, 'ltr', INVOICE, false],
  ['Noto Naskh Arabic', true, 'ltr', INVOICE, false],
];

const HAS_PDFTOTEXT = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
if (!HAS_PDFTOTEXT) console.warn('BUG-26 reading-order tests skipped: pdftotext not found on PATH (install poppler-utils).');

const norm = (s: string): string =>
  s
    .replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g, '')
    .replace(/\s+([\u064b-\u0652\u0670])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

async function pdf(family: string, bold: boolean, dir: 'rtl' | 'ltr', text: string): Promise<Uint8Array> {
  const r = validateReport({
    version: '1',
    id: 'b26',
    meta: { name: 'b26', locale: dir === 'rtl' ? 'ar' : 'en', dir },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
    dataset: { adapter: 'static', source: 'x' },
    fields: [],
    bands: {
      reportHeader: { height: 20, elements: [{ id: 'a', kind: 'text', value: text, style: { fontSize: 12, bold, font: family }, pos: { x: 0, y: 0, w: 186, h: 10 } }] },
      detail: { height: 0, elements: [] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return new Uint8Array(await (await exportPdf({ schema: r.value, rows: [] })).arrayBuffer());
}

describe('BUG-26: advanceless glyph width', () => {
  it('ends at the glyph and starts strictly left of both the glyph and the next one', () => {
    for (const [x, next] of [[100, 140], [100, 60], [100, 101], [0, -1], [-5, -30]] as const) {
      const w = advancelessWidth(x, next);
      expect(w).toBeLessThan(0);
      expect(x + w).toBeLessThan(Math.min(x, next));
      expect(x + w).toBe(Math.min(x, next) - 1);
    }
  });
  it('is 0 when the next glyph starts at the same x (gap-free, no Td needed)', () => {
    for (const x of [0, 100, -5]) expect(advancelessWidth(x, x)).toBe(0);
  });
});

describe.skipIf(!HAS_PDFTOTEXT)('BUG-26: pdftotext reading order (skipped when pdftotext is not installed)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wr-b26-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it.each(CASES.map(([f, b, d, t, e]) => [`${f} ${b ? 'Bold' : 'Regular'} ${d}`, f, b, d, t, e] as const))(
    '%s: the line extracts in source order',
    async (name, family, bold, dir, text, exact) => {
      const f = join(tmp, `${name.replace(/\W+/g, '-')}.pdf`);
      writeFileSync(f, await pdf(family, bold, dir, text));
      const out = norm(execFileSync('pdftotext', ['-enc', 'UTF-8', f, '-'], { encoding: 'utf8' }));
      if (exact) expect(out).toBe(norm(text));
      else expect(out.replace(/ /g, '')).toBe(norm(text).replace(/ /g, ''));
    },
  );
});
