import { describe, expect, it } from 'vitest';
import './reports-viewer.js';
import type { ReportsViewerElement } from './reports-viewer.js';
import { validateReport } from '../schema/report-schema.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
}

describe('viewer preview layout', () => {
  it('puts the parameters panel first and hides frozen export buttons', async () => {
    const viewer = document.createElement('reports-viewer') as ReportsViewerElement;
    viewer.locale = 'ar';
    viewer.dirOverride = 'rtl';
    document.body.appendChild(viewer);
    await flush(viewer);

    const frame = viewer.shadowRoot!.querySelector('.viewer-frame')!;
    expect(frame.firstElementChild?.getAttribute('data-testid')).toBe('viewer-parameters');
    expect(frame.querySelector('.params-head')?.textContent).toBe('معاملات التقرير');
    expect(viewer.getAttribute('dir')).toBe('rtl');

    const printBtn = viewer.shadowRoot!.querySelector<HTMLButtonElement>('button[data-action="print"]')!;
    const pdfBtn = viewer.shadowRoot!.querySelector<HTMLButtonElement>('button[data-action="pdf"]')!;
    expect(printBtn.hidden).toBe(false);
    expect(pdfBtn.hidden).toBe(true);
    expect(pdfBtn.disabled).toBe(true);
    viewer.remove();
  });

  it('shows Arabic field errors under the field and in the banner', async () => {
    const parsed = validateReport({
      version: '1',
      id: 'panel',
      meta: { name: 'P', locale: 'ar', dir: 'rtl' },
      dataset: { adapter: 'static', source: 'sales' },
      fields: [{ name: 'x', type: 'number' }],
      parameters: [
        { name: 'from', type: 'date', required: true, label: { ar: 'الفترة من', en: 'From' } },
        { name: 'branch', type: 'select', required: true, label: { ar: 'الفرع', en: 'Branch' }, options: [{ value: 'ruh', label: { ar: 'الرياض', en: 'Riyadh' } }] },
      ],
      bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 40, h: 5 } }] } },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const viewer = document.createElement('reports-viewer') as ReportsViewerElement;
    viewer.locale = 'ar';
    viewer.rows = [{ x: 1 }];
    viewer.schema = parsed.value;
    document.body.appendChild(viewer);
    await flush(viewer);
    await new Promise((r) => setTimeout(r, 0));
    const err = new Promise<CustomEvent>((resolve) => {
      viewer.addEventListener('parameters-error', (event) => resolve(event as CustomEvent), { once: true });
    });
    viewer.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="run-report"]')!.click();
    const event = await err;
    await viewer.updateComplete;
    await viewer.updateComplete;
    expect(event.detail.fieldErrors.from).toContain('الفترة من');
    expect(event.detail.fieldErrors.branch).toContain('الفرع');
    const markup = viewer.shadowRoot!.querySelector('.params-body')!.innerHTML;
    expect(markup.includes('field-error'), markup.slice(markup.indexOf('الفرع'), markup.indexOf('الفرع') + 400)).toBe(true);
    const errors = [...viewer.shadowRoot!.querySelectorAll('p.field-error')].map((node) => node.textContent ?? '').filter(Boolean);
    expect(errors).toHaveLength(2);
    expect(errors.join('')).toContain('يجب إدخال');
    expect(errors.join('')).toContain('الفترة من');
    expect(errors.join('')).toContain('الفرع');
    const from = viewer.shadowRoot!.querySelector<HTMLElement>('[data-testid="param-from"]')!;
    const branch = viewer.shadowRoot!.querySelector<HTMLElement>('[data-testid="param-branch"]')!;
    expect(from.getAttribute('aria-invalid')).toBe('true');
    expect(branch.getAttribute('aria-invalid')).toBe('true');
    expect(viewer.shadowRoot!.getElementById(from.getAttribute('aria-describedby')!)?.textContent).toContain('الفترة من');
    expect(viewer.shadowRoot!.getElementById(branch.getAttribute('aria-describedby')!)?.textContent).toContain('الفرع');
    const banner = viewer.shadowRoot!.querySelector<HTMLElement>('[data-testid="error-banner"]')!;
    expect(banner.getAttribute('title')).toBe(banner.textContent);
    expect(banner.textContent).toContain('يجب إدخال الفترة من');
    expect(banner.textContent).toContain('يجب إدخال الفرع');
    viewer.remove();
  });
});
