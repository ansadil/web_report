import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './reports-viewer.js';
import type { ReportsViewerElement } from './reports-viewer.js';
import { validateReport } from '../schema/report-schema.js';
import type { DataAdapter, DataQuery } from '../adapters/data/types.js';

function schemaWithParams() {
  const r = validateReport({
    version: '1',
    id: 'params',
    meta: { name: 'P', locale: 'en', dir: 'ltr' },
    dataset: { adapter: 'custom', source: 'sales', params: { region: 'west', tenant: 't1' } },
    fields: [{ name: 'x', type: 'number' }],
    parameters: [
      { name: 'year', type: 'number', required: true },
      { name: 'region', type: 'string' },
      { name: 'limit', type: 'number', default: 10 },
    ],
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function nextEvent(el: HTMLElement, name: string): Promise<CustomEvent> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${name} timeout`)), 5000);
    el.addEventListener(name, (e) => { clearTimeout(t); res(e as CustomEvent); }, { once: true });
  });
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('reports-viewer parameters', () => {
  let v: ReportsViewerElement;
  let calls: DataQuery[];
  let adapter: DataAdapter;

  beforeEach(() => {
    calls = [];
    adapter = { id: 'spy', fetch: vi.fn(async (q: DataQuery) => { calls.push(q); return [{ x: 1 }]; }) };
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
  });
  afterEach(() => v.remove());

  it('merges parameter values into DataQuery.params (explicit > default > static)', async () => {
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { year: '2026', region: 'east' };
    v.schema = schemaWithParams();
    await rendered;
    expect(calls.at(-1)).toEqual({ source: 'sales', params: { region: 'east', tenant: 't1', year: 2026, limit: 10 } });
  });

  it('refetches when parameter values change, but not for a structurally equal object', async () => {
    let rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.schema = schemaWithParams();
    v.params = { year: 2025 };
    await rendered;
    const before = calls.length;

    v.params = { year: 2025 }; // new object, same values
    await settle();
    expect(calls.length).toBe(before);

    rendered = nextEvent(v, 'report-rendered');
    v.params = { year: 2026 };
    await rendered;
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)!.params).toMatchObject({ year: 2026 });
  });

  it('does not fetch and reports a clear error when a required parameter is missing', async () => {
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.schema = schemaWithParams();
    const e = await err;
    expect(calls.length).toBe(0);
    expect(e.detail.issues).toEqual([{ name: 'year', code: 'required', message: 'value is required' }]);
    expect(e.detail.error).toMatch(/year: value is required/);
    await v.updateComplete;
    // banner: localized field errors (BUG-53), not the legacy English `error`
    expect(v.shadowRoot!.textContent).toMatch(/Invalid report parameters — year: year is required/);

    const rendered = nextEvent(v, 'report-rendered');
    v.params = { year: 2026 };
    await rendered;
    expect(calls.length).toBe(1);
  });

  it('reports invalid values (type coercion failure) without fetching', async () => {
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { year: 'abc' };
    v.schema = schemaWithParams();
    const e = await err;
    expect(e.detail.issues[0]).toMatchObject({ name: 'year', code: 'invalid' });
    expect(calls.length).toBe(0);
  });

  it('BUG-20: impossible or non-ISO date strings are rejected without fetching', async () => {
    const base = schemaWithParams();
    const s = { ...base, parameters: [{ name: 'day', type: 'date' as const, required: true }] };
    for (const bad of ['2026-02-30', '2026-04-31', '2026-13-01', '1', 'hello 5', '10/01/2026']) {
      const err = nextEvent(v, 'parameters-error');
      v.dataAdapter = adapter;
      v.params = { day: bad };
      v.schema = { ...s };
      const e = await err;
      expect(e.detail.issues[0]).toMatchObject({ name: 'day', code: 'invalid' });
    }
    expect(calls.length).toBe(0);
    const rendered = nextEvent(v, 'report-rendered');
    v.params = { day: '2026-10-01' };
    await rendered;
    expect(calls.at(-1)!.params).toMatchObject({ day: '2026-10-01' });
  });

  it('BUG-68: date-format-hint names the field format in the invalid-date message (31/02/2026)', async () => {
    const base = schemaWithParams();
    const s = { ...base, meta: { ...base.meta, locale: 'ar', dir: 'rtl' as const }, parameters: [{ name: 'day', type: 'date' as const, required: true }] };
    v.setAttribute('date-format-hint', 'يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م');
    expect(v.dateFormatHint).toBe('يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م');
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { day: '31/02/2026' };
    v.schema = s;
    const e = await err;
    expect(e.detail.fieldErrors.day).toBe('أدخل تاريخًا صالحًا (\u2068يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م\u2069)');
    expect(calls.length).toBe(0);
  });

  it('BUG-74: changing date-format-hint after an error re-words the shown field error and banner', async () => {
    const base = schemaWithParams();
    const s = { ...base, meta: { ...base.meta, locale: 'ar', dir: 'rtl' as const }, parameters: [{ name: 'day', type: 'date' as const, required: true }] };
    v.locale = 'ar';
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { day: '31/02/2026' };
    v.schema = s;
    await err;
    await v.updateComplete;
    const fieldError = () => (v as unknown as { _fieldErrors: Record<string, string> })._fieldErrors.day;
    const banner = () => v.shadowRoot!.textContent ?? '';
    expect(fieldError()).toBe('أدخل تاريخًا صالحًا (YYYY-MM-DD)');
    let events = 0;
    v.addEventListener('parameters-error', () => events++);
    v.dateFormatHint = 'يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م';
    await v.updateComplete;
    await settle();
    expect(fieldError()).toBe('أدخل تاريخًا صالحًا (\u2068يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م\u2069)');
    expect(banner()).toContain('يوم/شهر/سنة');
    expect(banner()).not.toContain('YYYY-MM-DD');
    expect(events).toBe(0);
    expect(calls.length).toBe(0);
  });

  it('ignores a stale response superseded by a newer parameter change', async () => {
    const resolvers: Array<(rows: { x: number }[]) => void> = [];
    const slow: DataAdapter = { id: 'slow', fetch: (q) => { calls.push(q); return new Promise((r) => resolvers.push(r)); } };
    const counts: number[] = [];
    v.addEventListener('report-rendered', (e) => counts.push((e as CustomEvent).detail.rows));
    v.dataAdapter = slow;
    v.schema = schemaWithParams();
    v.params = { year: 2025 };
    await settle();
    v.params = { year: 2026 };
    await settle();
    const first = resolvers[0]!;
    const last = resolvers.at(-1)!;
    last([{ x: 1 }, { x: 2 }]);
    await settle();
    first([{ x: 1 }]);
    await settle();
    expect(calls.at(-1)!.params).toMatchObject({ year: 2026 });
    expect(counts).toEqual([2]);
  });

  it('accepts datetime parameters in the schema and sends date/dateRange Dates as Asia/Riyadh calendar dates', async () => {
    const r = validateReport({
      version: '1', id: 'dates', meta: { name: 'D' },
      dataset: { adapter: 'custom', source: 't' },
      fields: [],
      parameters: [
        { name: 'day', type: 'date', required: true },
        { name: 'period', type: 'dateRange' },
        { name: 'at', type: 'datetime' },
      ],
      bands: { detail: { height: 5 } },
    });
    if (!r.ok) throw new Error(r.error);
    const at = new Date(2026, 9, 1, 8, 15);
    const riyadhMidnight = new Date('2026-10-01T00:00:00+03:00'); // default time zone Asia/Riyadh (BUG-52)
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { day: riyadhMidnight, period: { from: riyadhMidnight }, at };
    v.schema = r.value;
    await rendered;
    expect(calls.at(-1)!.params).toEqual({ day: '2026-10-01', period: { from: '2026-10-01' }, at: at.toISOString() });
  });

  it('old templates without parameters still fetch with static params', async () => {
    const r = validateReport({
      version: '1', id: 'old', meta: { name: 'O' },
      dataset: { adapter: 'custom', source: 't', params: { a: 1 } },
      fields: [], bands: { detail: { height: 5 } },
    });
    if (!r.ok) throw new Error(r.error);
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.schema = r.value;
    await rendered;
    expect(calls.at(-1)).toEqual({ source: 't', params: { a: 1 } });
  });
});

describe('reports-viewer parameters: Arabic banner and time zone (BUG-52, BUG-53)', () => {
  let v: ReportsViewerElement;
  let calls: DataQuery[];
  let adapter: DataAdapter;

  beforeEach(() => {
    calls = [];
    adapter = { id: 'spy', fetch: vi.fn(async (q: DataQuery) => { calls.push(q); return []; }) };
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
  });
  afterEach(() => v.remove());

  function arabicReport() {
    const r = validateReport({
      version: '1', id: 'ar', meta: { name: 'تقرير', locale: 'ar-SA', dir: 'rtl' },
      dataset: { adapter: 'custom', source: 'sales' },
      fields: [],
      parameters: [
        { name: 'branch', type: 'string', label: { ar: 'الفرع', en: 'Branch' }, required: true },
        { name: 'top', type: 'number', min: 1, max: 50 },
      ],
      bands: { detail: { height: 5 } },
    });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }

  it('builds the Arabic error banner from the localized field errors', async () => {
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { top: 80 };
    v.schema = arabicReport();
    const e = await err;
    await v.updateComplete;
    const banner = v.shadowRoot!.querySelector('.status')!.textContent!;
    expect(banner).toContain('قيم معاملات التقرير غير صالحة');
    expect(banner).toContain('\u2068الفرع\u2069: يجب إدخال الفرع');
    expect(banner).toContain('\u2068top\u2069: يجب ألا تزيد القيمة عن ٥٠');
    expect(banner).not.toMatch(/Invalid report parameters|must be|is required/);
    expect(e.detail.fieldErrors).toEqual({ branch: 'يجب إدخال الفرع', top: 'يجب ألا تزيد القيمة عن ٥٠' });
    expect(e.detail.error).toMatch(/Invalid report parameters/); // programmatic detail unchanged
    expect(calls.length).toBe(0);
  });

  it('shows the full Arabic banner at 900px, wrapping, with a tooltip and per-field errors', async () => {
    v.style.width = '900px';
    v.style.height = '640px';
    v.locale = 'ar';
    v.dirOverride = 'rtl';
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { top: 80 };
    v.schema = arabicReport();
    await err;
    await v.updateComplete;
    const banner = v.shadowRoot!.querySelector<HTMLElement>('[data-testid="error-banner"]')!;
    const full = banner.textContent ?? '';
    expect(full).toContain('قيم معاملات التقرير غير صالحة');
    expect(full).toContain('\u2068الفرع\u2069: يجب إدخال الفرع');
    expect(full).toContain('\u2068top\u2069: يجب ألا تزيد القيمة عن ٥٠');
    expect(banner.getAttribute('title')).toBe(full);
    expect(banner.getAttribute('dir')).toBe('rtl');
    expect(banner.parentElement).toBe(v.shadowRoot!.querySelector('.viewer-main'));
    expect(v.style.width).toBe('900px');
    const css = getComputedStyle(banner);
    expect(css.whiteSpace).toBe('normal');
    expect(css.overflow).toBe('visible');
    expect(css.textOverflow).not.toBe('ellipsis');
    expect(css.maxWidth).toBe('none');
    expect(css.width === '100%' || banner.clientWidth > 280).toBe(true);
    if (banner.clientWidth > 0) {
      expect(banner.clientWidth).toBeGreaterThan(280);
      expect(banner.clientWidth).toBeLessThanOrEqual(900);
      expect(banner.scrollWidth).toBeLessThanOrEqual(banner.clientWidth + 1);
    }
    const branch = v.shadowRoot!.querySelector<HTMLElement>('[data-testid="param-branch"]')!;
    const top = v.shadowRoot!.querySelector<HTMLElement>('[data-testid="param-top"]')!;
    expect(branch.getAttribute('aria-invalid')).toBe('true');
    expect(top.getAttribute('aria-invalid')).toBe('true');
    expect(v.shadowRoot!.getElementById(branch.getAttribute('aria-describedby')!)?.textContent).toContain('يجب إدخال الفرع');
    expect(v.shadowRoot!.getElementById(top.getAttribute('aria-describedby')!)?.textContent).toContain('٥٠');
  });

  it('uses the viewer locale for the banner when it overrides the report locale', async () => {
    v.locale = 'en';
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { top: 80 };
    v.schema = arabicReport();
    await err;
    await v.updateComplete;
    expect(v.shadowRoot!.querySelector('.status')!.textContent).toContain('Invalid report parameters — Branch: Branch is required; top: Must be at most 50');
  });

  function dateReport() {
    const r = validateReport({
      version: '1', id: 'tz', meta: { name: 'T' },
      dataset: { adapter: 'custom', source: 't' },
      fields: [],
      parameters: [{ name: 'day', type: 'date', required: true }],
      bands: { detail: { height: 5 } },
    });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }
  const instant = new Date('2026-10-31T22:30:00Z'); // 2026-11-01 in Riyadh, 2026-10-31 in UTC

  it('defaults to Asia/Riyadh for Date values, whatever the process TZ', async () => {
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { day: instant };
    v.schema = dateReport();
    await rendered;
    expect(calls.at(-1)!.params).toEqual({ day: '2026-11-01' });
  });

  it('honours the time-zone attribute and refetches when timeZone changes', async () => {
    v.setAttribute('time-zone', 'UTC');
    expect(v.timeZone).toBe('UTC');
    let rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { day: instant };
    v.schema = dateReport();
    await rendered;
    expect(calls.at(-1)!.params).toEqual({ day: '2026-10-31' });

    rendered = nextEvent(v, 'report-rendered');
    v.timeZone = 'Asia/Riyadh';
    await rendered;
    expect(calls.at(-1)!.params).toEqual({ day: '2026-11-01' });
  });

  it('falls back to Asia/Riyadh for an unknown time zone', async () => {
    v.timeZone = 'Mars/Olympus';
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { day: instant };
    v.schema = dateReport();
    await rendered;
    expect(calls.at(-1)!.params).toEqual({ day: '2026-11-01' });
  });

  it('BUG-59: emits time-zone-invalid once per unknown zone (not parameters-error) and still renders', async () => {
    const invalid: CustomEvent[] = [];
    const paramErrors: Event[] = [];
    v.addEventListener('time-zone-invalid', (e) => invalid.push(e as CustomEvent));
    v.addEventListener('parameters-error', (e) => paramErrors.push(e));
    v.setAttribute('time-zone', 'Mars/Olympus');
    let rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { day: instant };
    v.schema = dateReport();
    await rendered;
    expect(invalid.map((e) => e.detail)).toEqual([{ timeZone: 'Mars/Olympus', fallback: 'Asia/Riyadh' }]);
    expect(paramErrors).toHaveLength(0);
    expect(calls.at(-1)!.params).toEqual({ day: '2026-11-01' });

    // re-renders with the same bad zone do not repeat the event
    rendered = nextEvent(v, 'report-rendered');
    v.params = { day: '2026-10-01' };
    await rendered;
    expect(invalid).toHaveLength(1);

    // a different bad zone is reported again; a valid one is not
    v.timeZone = 'Not/AZone';
    await settle();
    expect(invalid.map((e) => e.detail.timeZone)).toEqual(['Mars/Olympus', 'Not/AZone']);
    rendered = nextEvent(v, 'report-rendered');
    v.timeZone = 'UTC';
    await rendered;
    expect(invalid).toHaveLength(2);
    v.timeZone = '';
    await settle();
    expect(invalid).toHaveLength(2);
  });
});
