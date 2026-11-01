import { describe, expect, it } from 'vitest';
import './reports-viewer.js';
import type { ReportsViewerElement } from './reports-viewer.js';

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
});
