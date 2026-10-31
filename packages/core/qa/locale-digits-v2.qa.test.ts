/**
 * QA (v2) — PR fix/arabic-locale-digits-v2: Arabic-Indic digits for every Arabic locale,
 * page numbers follow the report number locale, meta.pageNumberDigits:'latn'.
 * Expected to FAIL on main 6bc6f5a (feature not there yet).
 * Set QA_EVIDENCE_DIR to also write the exported PDFs there.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as shared from '@reports-web/shared';
import { replacePageTokens } from '../src/engine/page-tokens.js';
import { exportPdf } from '../src/exporters/pdf.js';
import { mustValidate } from './helpers/fixtures.js';
import { drawnRuns, extractPdfText } from './helpers/pdf-text.js';

const fmt2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const EASTERN = /[\u0660-\u0669]/;

describe('locale digits (v2)', () => {
  for (const loc of ['ar', 'ar-SA', 'ar-EG']) {
    it(`formatNumber 1234.5 with ${loc} → ١٬٢٣٤٫٥٠`, () => {
      expect(shared.formatNumber(1234.5, loc as 'ar', fmt2)).toBe('١٬٢٣٤٫٥٠');
    });
    it(`applyPattern decimal2 with ${loc} → ١٬٢٣٤٫٥٠`, () => {
      expect(shared.applyPattern(1234.5, 'decimal2', loc as 'ar')).toBe('١٬٢٣٤٫٥٠');
    });
  }
  it('ar-SA-u-nu-latn keeps Western digits (1,234.50)', () => {
    const s = shared.formatNumber(1234.5, 'ar-SA-u-nu-latn' as 'ar', fmt2);
    expect(s).not.toMatch(EASTERN);
    expect(s.replace(/[^\d.,]/g, '')).toBe('1,234.50');
  });
  it('replacePageTokens with locale ar → «صفحة ١ من ٨»', () => {
    const ctx = { page: 1, pages: 8, locale: 'ar' } as Parameters<typeof replacePageTokens>[1];
    expect(replacePageTokens('صفحة {page} من {pages}', ctx)).toBe('صفحة ١ من ٨');
  });
  it('replacePageTokens with locale en → Western «Page 1 of 8»', () => {
    const ctx = { page: 1, pages: 8, locale: 'en' } as Parameters<typeof replacePageTokens>[1];
    expect(replacePageTokens('Page {page} of {pages}', ctx)).toBe('Page 1 of 8');
  });
  it('replacePageTokens without locale stays Western (backward compatible)', () => {
    expect(replacePageTokens('صفحة {page} من {pages}', { page: 1, pages: 8 })).toBe('صفحة 1 من 8');
  });
});

/** Arabic report with only text (no numbers in the body) so footer digits are the only digits drawn. */
function footerSchema(extraMeta: Record<string, unknown> = {}) {
  return mustValidate({
    version: '1',
    id: 'qa-footer',
    meta: { name: 'تقرير', locale: 'ar', dir: 'rtl', ...extraMeta },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'item', type: 'string', label: 'الصنف' }],
    bands: {
      detail: { height: 30, elements: [{ id: 'd', kind: 'field', field: 'item', pos: { x: 0, y: 0, w: 180, h: 6 } }] },
      pageFooter: { height: 8, elements: [{ id: 'pf', kind: 'text', value: 'صفحة {page} من {pages}', pos: { x: 0, y: 0, w: 180, h: 7 }, style: { align: 'center' } }] },
    },
  });
}
const ROWS = Array.from({ length: 60 }, () => ({ item: 'الإدارة العامة' }));

async function footerPdf(extraMeta: Record<string, unknown>, file: string) {
  const blob = await exportPdf({ schema: footerSchema(extraMeta), rows: ROWS });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (process.env.QA_EVIDENCE_DIR) writeFileSync(join(process.env.QA_EVIDENCE_DIR, file), bytes);
  const pages = (await extractPdfText(bytes)).numPages;
  const p1 = (await drawnRuns(bytes)).filter((r) => r.page === 1).map((r) => r.text).join(' | ');
  return { pages, p1 };
}

describe('PDF footer page numbers (v2)', () => {
  it('Arabic PDF footer uses Arabic-Indic page numbers by default', async () => {
    const { pages, p1 } = await footerPdf({}, 'footer-ar-locale.pdf');
    expect(pages).toBeGreaterThan(1);
    expect(p1).toMatch(/١/);
    expect(p1).toContain(new Intl.NumberFormat('ar-u-nu-arab').format(pages));
    expect(p1).not.toMatch(/[0-9]/);
  });
  it("meta.pageNumberDigits:'latn' forces Western page numbers in the PDF footer", async () => {
    const { pages, p1 } = await footerPdf({ pageNumberDigits: 'latn' }, 'footer-ar-latn.pdf');
    expect(p1).toMatch(/1/);
    expect(p1).toContain(String(pages));
    expect(p1).not.toMatch(EASTERN);
  });
  it("meta.pageNumberDigits rejects unknown values", () => {
    expect(() => footerSchema({ pageNumberDigits: 'arab' })).toThrow();
  });
});
