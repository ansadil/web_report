// @vitest-environment happy-dom
/**
 * QA (v2) — PR feat/meta-locale-bcp47-v2: meta.locale accepts BCP 47 tags; dir inferred for RTL locales.
 * Expected to FAIL on main 6bc6f5a. Set QA_EVIDENCE_DIR to write the exported PDFs there.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReport } from '../src/schema/report-schema.js';
import { resolveDir } from '../src/components/direction.js';
import { exportPdf } from '../src/exporters/pdf.js';
import '../src/components/reports-viewer.js';
import type { ReportsViewerElement } from '../src/components/reports-viewer.js';
import { arabicSchema } from './helpers/fixtures.js';
import { extractPdfText, norm } from './helpers/pdf-text.js';

const base = (meta: Record<string, unknown>) => ({
  version: '1',
  id: 'bcp',
  meta: { name: 'T', ...meta },
  page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
  dataset: { adapter: 'static', source: 't' },
  fields: [{ name: 'item', type: 'string' }],
  bands: {
    reportHeader: { height: 10, elements: [{ id: 't', kind: 'text', value: 'تقرير المبيعات', pos: { x: 0, y: 0, w: 60, h: 7 } }] },
    detail: { height: 7, elements: [{ id: 'd', kind: 'field', field: 'item', pos: { x: 0, y: 0, w: 60, h: 6 } }] },
  },
});
const validate = (meta: Record<string, unknown>) => validateReport(base(meta));
const metaOf = (meta: Record<string, unknown>) => {
  const r = validate(meta);
  if (!r.ok) throw new Error(r.error);
  return r.value.meta;
};

describe('BCP 47 locale → direction (v2)', () => {
  for (const loc of ['ar-SA', 'ar-EG', 'fa', 'he', 'ur']) {
    it(`resolveDir(no host, no meta.dir, ${loc}) → rtl`, () => {
      expect(resolveDir(undefined, { locale: loc as 'ar' })).toBe('rtl');
    });
    it(`schema default dir for ${loc} → rtl`, () => expect(metaOf({ locale: loc }).dir).toBe('rtl'));
  }
  for (const loc of ['en-US', 'fr']) {
    it(`resolveDir(${loc}) → ltr`, () => expect(resolveDir(undefined, { locale: loc as 'en' })).toBe('ltr'));
    it(`schema default dir for ${loc} → ltr`, () => expect(metaOf({ locale: loc }).dir).toBe('ltr'));
  }
  it('explicit meta.dir wins over locale inference', () => {
    expect(metaOf({ locale: 'ar-SA', dir: 'ltr' }).dir).toBe('ltr');
    expect(metaOf({ locale: 'en-US', dir: 'rtl' }).dir).toBe('rtl');
    expect(resolveDir(undefined, { locale: 'he' as 'ar', dir: 'ltr' })).toBe('ltr');
    expect(resolveDir(undefined, { locale: 'fr' as 'en', dir: 'rtl' })).toBe('rtl');
  });
  it('host dir wins over meta.dir and locale', () => {
    expect(resolveDir('ltr', { locale: 'ar-SA' as 'ar', dir: 'rtl' })).toBe('ltr');
    expect(resolveDir('rtl', { locale: 'en-US' as 'en', dir: 'ltr' })).toBe('rtl');
  });
  for (const bad of ['xx_yy!!', 'ar_SA', '', 'not a tag', 42]) {
    it(`schema rejects invalid locale ${JSON.stringify(bad)}`, () => {
      const r = validate({ locale: bad });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/locale/);
    });
  }
  it('tags are canonicalized (AR-sa → ar-SA)', () => expect(metaOf({ locale: 'AR-sa' }).locale).toBe('ar-SA'));
  it("old 'ar' / 'en' templates validate unchanged", () => {
    expect(metaOf({ locale: 'ar' })).toMatchObject({ locale: 'ar', dir: 'rtl' });
    expect(metaOf({ locale: 'en' })).toMatchObject({ locale: 'en', dir: 'ltr' });
    expect(metaOf({})).toMatchObject({ locale: 'en', dir: 'ltr' });
    const ar = arabicSchema();
    expect(ar.meta).toMatchObject({ locale: 'ar', dir: 'rtl' });
  });
});

describe('ar-SA template without dir (v2)', () => {
  it('<reports-viewer> renders the surface rtl', async () => {
    document.documentElement.dir = 'ltr';
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
    const done = new Promise((res) => v.addEventListener('report-rendered', res, { once: true }));
    const r = validate({ locale: 'ar-SA' });
    if (!r.ok) throw new Error(r.error);
    v.schema = r.value;
    v.rows = [{ item: 'قلم' }];
    await done;
    await v.updateComplete;
    expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe('rtl');
    v.remove();
  });
  it('PDF lays out RTL: a 60mm-wide box at x=0 is drawn at the right margin', async () => {
    const r = validate({ locale: 'ar-SA' });
    if (!r.ok) throw new Error(r.error);
    const bytes = new Uint8Array(await (await exportPdf({ schema: r.value, rows: [{ item: 'قلم رصاص' }] })).arrayBuffer());
    if (process.env.QA_EVIDENCE_DIR) writeFileSync(join(process.env.QA_EVIDENCE_DIR, 'bcp47-ar-SA-nodir.pdf'), bytes);
    const t = await extractPdfText(bytes);
    const title = t.items.find((i) => norm(i.str).includes(norm('المبيعات')));
    expect(title, 'title text drawn').toBeTruthy();
    // A4 = 595pt; right margin 15mm ≈ 42.5pt → content right edge ≈ 552pt. RTL box spans ~382..552pt.
    expect(title!.x).toBeGreaterThan(t.pageWidth / 2);
  });
});
