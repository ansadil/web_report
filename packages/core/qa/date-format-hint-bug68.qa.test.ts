// @vitest-environment happy-dom
/**
 * BUG-68: 31/02/2026 shows the date format of the report locale.
 * BUG-76: locales with an underscore (`ar_SA`) are normalized to `ar-SA` before dateFormatHintFor.
 * Switching the hint after the error is visible must refresh the text (core BUG-74).
 */
import { describe, expect, it } from 'vitest';
import '../src/components/reports-viewer.js';
import type { ReportsViewerElement } from '../src/components/reports-viewer.js';
import { dateFormatHintFor } from '../src/engine/parameters.js';
import { validateReport } from '../src/schema/report-schema.js';

function hintFor(locale: string): string {
  return dateFormatHintFor(locale.replace(/_/g, '-'));
}

function schema(locale: string) {
  const parsed = validateReport({
    version: '1',
    id: 'hint',
    meta: { name: 'P', locale, dir: locale.replace(/_/g, '-').toLowerCase().startsWith('ar') ? 'rtl' : 'ltr' },
    dataset: { adapter: 'static', source: 'sales' },
    fields: [{ name: 'x', type: 'number' }],
    parameters: [{ name: 'from', type: 'date', required: true, default: '2026-10-01', label: { ar: 'الفترة من', en: 'From' } }],
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 40, h: 5 } }] } },
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

async function flush(viewer: ReportsViewerElement): Promise<void> {
  await viewer.updateComplete;
}

describe('BUG-68 date format hint follows the report locale', () => {
  it('shows the Arabic format for 31/02/2026 and updates when the report locale changes', async () => {
    const viewer = document.createElement('reports-viewer') as ReportsViewerElement;
    viewer.locale = 'ar';
    viewer.dateFormatHint = hintFor('ar_SA');
    viewer.rows = [{ x: 1 }];
    viewer.schema = schema('ar');
    document.body.appendChild(viewer);
    await flush(viewer);

    const input = viewer.shadowRoot!.querySelector<HTMLInputElement>('[data-testid="param-from"]')!;
    input.value = '31/02/2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    viewer.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="run-report"]')!.click();
    await flush(viewer);

    const error = () => viewer.shadowRoot!.querySelector('#param-error-from')?.textContent ?? '';
    expect(error()).toContain('يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م');

    viewer.dateFormatHint = hintFor('en');
    await flush(viewer);
    expect(error()).toContain('YYYY-MM-DD');
    expect(error()).not.toContain('يوم/شهر/سنة');
    viewer.remove();
  });
});
