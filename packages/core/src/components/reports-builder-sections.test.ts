import { describe, it, expect, beforeEach } from 'vitest';
import './reports-builder.js';
import type { ReportsBuilderElement } from './reports-builder.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
}

function schemaMinimalBands(): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'sec-test',
    meta: { name: 'Sections', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [{ name: 'region', type: 'string' }],
    groups: [
      {
        key: 'region',
        header: { height: 6, pageBreakBefore: true, elements: [] },
        footer: { height: 5, elements: [] },
      },
    ],
    bands: {
      detail: { height: 11, pageBreakAfter: true, elements: [] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('reports-builder report band properties', () => {
  let b: ReportsBuilderElement;

  beforeEach(() => {
    b = document.createElement('reports-builder') as ReportsBuilderElement;
    b.schema = schemaMinimalBands();
    document.body.appendChild(b);
  });

  it('lists each root band with height and page-break controls', async () => {
    await flush(b);
    const detailPanel = b.shadowRoot!.querySelector('[data-root-band="detail"]');
    expect(detailPanel).toBeTruthy();
    const heightInput = detailPanel!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(heightInput.value).toBe('11');
    const checks = detailPanel!.querySelectorAll('input[type="checkbox"]');
    expect(checks.length).toBe(2);
    expect((checks[0] as HTMLInputElement).checked).toBe(false);
    expect((checks[1] as HTMLInputElement).checked).toBe(true);
  });

  it('updates detail band height from document properties', async () => {
    await flush(b);
    const detailPanel = b.shadowRoot!.querySelector('[data-root-band="detail"]')!;
    const heightInput = detailPanel.querySelector('input[type="number"]') as HTMLInputElement;
    heightInput.value = '20';
    heightInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(b);
    const internal = b as unknown as { _schema: ReportSchemaV1 };
    expect(internal._schema.bands.detail.height).toBe(20);
  });

  it('offers enable for optional bands that are absent', async () => {
    await flush(b);
    const ph = b.shadowRoot!.querySelector('[data-root-band="pageHeader"]');
    expect(ph?.querySelector('button.secondary')?.textContent).toContain('Enable');
  });

  it('exposes group band editors when groups exist', async () => {
    await flush(b);
    const groupPanel = b.shadowRoot!.querySelector('[data-group-index="0"]');
    expect(groupPanel).toBeTruthy();
    const keyInput = Array.from(groupPanel!.querySelectorAll('input')).find(
      (el) => (el as HTMLInputElement).type === 'text',
    ) as HTMLInputElement;
    expect(keyInput.value).toBe('region');
    const nested = groupPanel!.querySelectorAll('.nested-band');
    expect(nested.length).toBeGreaterThanOrEqual(1);
    const headerChecks = nested[0].querySelectorAll('input[type="checkbox"]');
    expect(headerChecks.length).toBe(2);
    expect((headerChecks[0] as HTMLInputElement).checked).toBe(true);
    expect((headerChecks[1] as HTMLInputElement).checked).toBe(false);
  });
});
