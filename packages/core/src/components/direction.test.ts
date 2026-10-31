import { describe, it, expect } from 'vitest';
import { resolveDir, resolveLocale } from './direction.js';
import { validateReport } from '../schema/report-schema.js';
import { t } from '../i18n/strings.js';
import './reports-viewer.js';
import './reports-builder.js';
import type { ReportsViewerElement } from './reports-viewer.js';

function schema(meta: Record<string, unknown>) {
  const r = validateReport({
    version: '1',
    id: 'dir',
    meta: { name: 'تقرير', ...meta },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

async function rendered(v: ReportsViewerElement): Promise<void> {
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), 5000);
    v.addEventListener('report-rendered', () => { clearTimeout(t); res(); }, { once: true });
  });
  await (v as unknown as { updateComplete: Promise<unknown> }).updateComplete;
}

describe('resolveLocale / resolveDir', () => {
  it('host override wins', () => {
    expect(resolveLocale('en', { locale: 'ar' })).toBe('en');
    expect(resolveDir('ltr', { dir: 'rtl' })).toBe('ltr');
  });
  it('falls back to the template', () => {
    expect(resolveLocale(undefined, { locale: 'ar' })).toBe('ar');
    expect(resolveDir('', { dir: 'rtl' })).toBe('rtl');
  });
  it('infers rtl from Arabic when no dir anywhere', () => {
    expect(resolveDir(undefined, { locale: 'ar' })).toBe('rtl');
    expect(resolveDir(undefined, null, 'ar')).toBe('rtl');
    expect(resolveDir(undefined, null)).toBe('ltr');
  });
});

describe('schema meta.dir default', () => {
  it('Arabic template without dir validates as rtl', () => {
    expect(schema({ locale: 'ar' }).meta.dir).toBe('rtl');
  });
  it('English template without dir validates as ltr', () => {
    expect(schema({}).meta.dir).toBe('ltr');
  });
  it('explicit dir is kept', () => {
    expect(schema({ locale: 'ar', dir: 'ltr' }).meta.dir).toBe('ltr');
  });
});

describe('reports-viewer respects the template', () => {
  it('Arabic template renders rtl inside an ltr page with no host props', async () => {
    document.documentElement.dir = 'ltr';
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
    v.schema = schema({ locale: 'ar', dir: 'rtl' });
    v.rows = [{ x: 1 }];
    await rendered(v);
    expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe('rtl');
    v.remove();
  });
  it('host dir still overrides when set explicitly', async () => {
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    v.dir = 'ltr';
    document.body.appendChild(v);
    v.schema = schema({ locale: 'ar', dir: 'rtl' });
    v.rows = [{ x: 1 }];
    await rendered(v);
    expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe('ltr');
    v.remove();
  });
});

describe('reports-builder canvas follows the template', () => {
  it('canvas is rtl for an Arabic template even with no host props', async () => {
    const b = document.createElement('reports-builder') as HTMLElement & { schema: unknown; updateComplete: Promise<unknown> };
    document.body.appendChild(b);
    b.schema = schema({ locale: 'ar' });
    await b.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await b.updateComplete;
    expect(b.shadowRoot!.querySelector('.canvas')!.getAttribute('dir')).toBe('rtl');
    b.remove();
  });
});

describe('host dir attribute follows the template without becoming an override', () => {
  it('viewer host gets dir=rtl, then flips back when the template becomes English', async () => {
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
    v.schema = schema({ locale: 'ar' });
    v.rows = [{ x: 1 }];
    await rendered(v);
    expect(v.getAttribute('dir')).toBe('rtl');
    expect(v.dir).toBe('');
    v.schema = schema({ locale: 'en' });
    await rendered(v);
    expect(v.getAttribute('dir')).toBe('ltr');
    v.remove();
  });
  it('an explicit dir attribute is kept as an override', async () => {
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    v.setAttribute('dir', 'ltr');
    document.body.appendChild(v);
    v.schema = schema({ locale: 'ar' });
    v.rows = [{ x: 1 }];
    await rendered(v);
    expect(v.dir).toBe('ltr');
    expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe('ltr');
    v.remove();
  });
});

describe('resolveDir infers rtl for every RTL locale tag (isRtlLocale)', () => {
  it.each(['ar', 'ar-SA', 'ar-EG', 'fa', 'fa-IR', 'he', 'ur', 'ps', 'sd', 'ckb', 'yi', 'dv'])('%s -> rtl', (locale) => {
    expect(resolveDir(undefined, { locale })).toBe('rtl');
    expect(resolveDir('', null, locale)).toBe('rtl');
  });
  it.each(['en', 'en-US', 'en-GB', 'fr', 'arn', 'xx_yy!!'])('%s -> ltr', (locale) => {
    expect(resolveDir(undefined, { locale })).toBe('ltr');
    expect(resolveDir('', null, locale)).toBe('ltr');
  });
  it('explicit meta.dir always wins over the locale', () => {
    expect(resolveDir(undefined, { locale: 'ar-SA', dir: 'ltr' })).toBe('ltr');
    expect(resolveDir(undefined, { locale: 'he', dir: 'ltr' })).toBe('ltr');
    expect(resolveDir(undefined, { locale: 'en-US', dir: 'rtl' })).toBe('rtl');
    expect(resolveDir(undefined, { locale: 'fr', dir: 'rtl' })).toBe('rtl');
  });
  it('host dir wins over meta.dir and the locale', () => {
    expect(resolveDir('ltr', { locale: 'ar-EG' })).toBe('ltr');
    expect(resolveDir('rtl', { locale: 'en-US', dir: 'ltr' })).toBe('rtl');
  });
  it('resolveLocale keeps full BCP 47 tags', () => {
    expect(resolveLocale(undefined, { locale: 'ar-SA' })).toBe('ar-SA');
    expect(resolveLocale('fa-IR', { locale: 'ar' })).toBe('fa-IR');
  });
});

describe('schema meta.dir default for BCP 47 tags', () => {
  it.each(['ar-SA', 'ar-EG', 'fa', 'he', 'ur'])('%s without dir -> rtl', (locale) => {
    expect(schema({ locale }).meta.dir).toBe('rtl');
  });
  it.each(['en-US', 'fr'])('%s without dir -> ltr', (locale) => {
    expect(schema({ locale }).meta.dir).toBe('ltr');
  });
  it('explicit dir wins', () => {
    expect(schema({ locale: 'ar-SA', dir: 'ltr' }).meta.dir).toBe('ltr');
    expect(schema({ locale: 'en-US', dir: 'rtl' }).meta.dir).toBe('rtl');
  });
});

describe('reports-viewer with an ar-SA template and no host props', () => {
  it('renders rtl with Arabic-Indic digits and Arabic UI strings', async () => {
    document.documentElement.dir = 'ltr';
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
    const s = schema({ locale: 'ar-SA' });
    const detail = s.bands.detail;
    v.schema = { ...s, bands: { ...s.bands, detail: { ...detail, elements: detail.elements.map((e) => ({ ...e, format: 'decimal2' })) } } };
    v.rows = [{ x: 1234.5 }];
    await rendered(v);
    expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe('rtl');
    expect(v.getAttribute('dir')).toBe('rtl');
    const text = v.shadowRoot!.textContent ?? '';
    expect(text).toMatch(/[\u0660-\u0669]/);
    expect(text).toContain('١٬٢٣٤٫٥٠');
    expect(text).not.toContain('1,234.50');
    expect(text).toContain(t('ar', 'print'));
    expect(t('ar', 'print')).not.toBe(t('en', 'print'));
    v.remove();
  });
  it('fa-IR template is rtl too; en-GB is ltr', async () => {
    for (const [locale, want] of [['fa-IR', 'rtl'], ['en-GB', 'ltr']] as const) {
      const v = document.createElement('reports-viewer') as ReportsViewerElement;
      document.body.appendChild(v);
      v.schema = schema({ locale });
      v.rows = [{ x: 1 }];
      await rendered(v);
      expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe(want);
      v.remove();
    }
  });
});
