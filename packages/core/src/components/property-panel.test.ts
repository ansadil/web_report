import { describe, it, expect, afterEach } from 'vitest';
import './reports-builder.js';
import type { ReportsBuilderElement } from './reports-builder.js';
import { validateReport } from '../schema/report-schema.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
}

function schema() {
  const result = validateReport({
    version: '1',
    id: 'panel',
    meta: { name: 'Panel', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    groups: [],
    bands: {
      detail: {
        height: 20,
        elements: [{ id: 'title', kind: 'text', value: 'Title', style: { fontSize: 18, align: 'center' }, pos: { x: 10, y: 2, w: 80, h: 8 } }],
      },
    },
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('property panel details', () => {
  let builder: ReportsBuilderElement | undefined;
  afterEach(() => builder?.remove());

  it('the page category has a chevron, holds the page rows, and collapses', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'en';
    builder.dir = 'ltr';
    builder.schema = schema();
    await flush(builder);

    const page = builder.shadowRoot!.querySelector<HTMLElement>('[data-testid="cat-page"]')!;
    const header = page.querySelector('button.cat-h')!;
    expect(header.querySelector('.cnt')?.textContent).toBe('6');
    expect(header.textContent).toContain('Page');
    const body = page.querySelector('.cat-b')!;
    expect(body.querySelector('[data-testid="prop-paper-size"]')).toBeTruthy();
    expect(body.querySelector('[data-testid="prop-page-orientation"]')).toBeTruthy();
    expect(body.querySelectorAll('[data-testid^="prop-margin-"]')).toHaveLength(4);
    expect(getComputedStyle(body).display).not.toBe('none');

    header.click();
    expect(page.classList.contains('closed')).toBe(true);
    expect(getComputedStyle(body).display).toBe('none');
    header.click();
    expect(page.classList.contains('closed')).toBe(false);
    expect(getComputedStyle(body).display).not.toBe('none');

    const dock = builder.shadowRoot!.querySelector('[data-section="properties"] .section-body')!;
    expect(getComputedStyle(dock).overflowY).toBe('auto');
  });

  it('long property labels stay whole and expose a tooltip', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'en';
    builder.dir = 'ltr';
    builder.schema = schema();
    await flush(builder);
    const element = builder.shadowRoot!.querySelector<HTMLElement>('[data-testid="element-title"]')!;
    element.setPointerCapture = () => undefined;
    element.releasePointerCapture = () => undefined;
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 8, clientY: 8 }));
    await flush(builder);

    const label = [...builder.shadowRoot!.querySelectorAll<HTMLElement>('.prow .k')].find((node) => node.textContent === 'Horizontal alignment');
    expect(label?.title).toBe('Horizontal alignment');
    expect(getComputedStyle(label!).whiteSpace).not.toBe('nowrap');
    expect(label!.textContent).toBe('Horizontal alignment');
  });
});
