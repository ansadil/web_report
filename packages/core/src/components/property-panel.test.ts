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

  it('BUG-57 rejects a 40cm left margin on A4 and still applies a valid margin', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'ar';
    builder.dir = 'rtl';
    builder.schema = schema();
    await flush(builder);

    const left = builder.shadowRoot!.querySelector<HTMLInputElement>('[data-testid="prop-margin-left"]')!;
    left.value = '40';
    left.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(builder);

    expect(builder.getSchema().page.margins.left).toBe(10);
    const rejected = builder.shadowRoot!.querySelector<HTMLInputElement>('[data-testid="prop-margin-left"]')!;
    expect(rejected.getAttribute('aria-invalid')).toBe('true');
    const error = builder.shadowRoot!.querySelector('#prop-margin-left-error')!;
    expect(error.textContent).toContain('عرض الورقة');
    expect(rejected.getAttribute('aria-describedby')).toBe('prop-margin-left-error');

    rejected.value = '2';
    rejected.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(builder);
    expect(builder.getSchema().page.margins.left).toBe(20);
    expect(builder.shadowRoot!.querySelector('[data-testid="prop-margin-left"]')!.getAttribute('aria-invalid')).toBe('false');
    expect(builder.shadowRoot!.querySelector('#prop-margin-left-error')).toBeNull();
  });

  it('BUG-66 rejects A4 portrait margins that leave less than 50mm of content', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'en';
    builder.dir = 'ltr';
    builder.schema = schema();
    await flush(builder);

    const right = builder.shadowRoot!.querySelector<HTMLInputElement>('[data-testid="prop-margin-right"]')!;
    right.value = '10.4';
    right.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(builder);
    const left = builder.shadowRoot!.querySelector<HTMLInputElement>('[data-testid="prop-margin-left"]')!;
    left.value = '10';
    left.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(builder);

    expect(builder.getSchema().page.margins.left).toBe(10);
    expect(builder.getSchema().page.margins.right).toBe(104);
    const error = builder.shadowRoot!.querySelector('#prop-margin-left-error')!;
    expect(left.getAttribute('aria-invalid')).toBe('true');
    expect(error.textContent).toContain('content width');
    expect(error.textContent).toContain('5.00 cm');
  });

  it('BUG-66 shows a notice when a loaded template is clamped to 50mm of content', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'ar';
    builder.dir = 'rtl';
    const loaded = schema();
    loaded.page = { ...loaded.page, margins: { ...loaded.page.margins, left: 400 } };
    builder.schema = loaded;
    await flush(builder);

    const margins = builder.getSchema().page.margins;
    expect(210 - margins.left - margins.right).toBeGreaterThanOrEqual(50);
    expect(margins.left).toBeLessThan(180);
    const notice = builder.shadowRoot!.querySelector('[data-testid="page-margin-notice"]')!;
    expect(notice.textContent).toContain('تم ضبط الهوامش');
    expect(builder.shadowRoot!.querySelector('#prop-margin-left-error')?.textContent).toContain('تم ضبط الهوامش');
  });

  it('BUG-67 clamps margins when landscape becomes portrait and when the paper becomes A5', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'en';
    builder.dir = 'ltr';
    builder.schema = schema();
    await flush(builder);

    const orientation = builder.shadowRoot!.querySelector<HTMLSelectElement>('[data-testid="prop-page-orientation"]')!;
    orientation.value = 'landscape';
    orientation.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(builder);

    const setMargin = (side: 'left' | 'right', value: string) => {
      const input = builder!.shadowRoot!.querySelector<HTMLInputElement>(`[data-testid="prop-margin-${side}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setMargin('left', '12');
    setMargin('right', '12');
    await flush(builder);
    expect(builder.getSchema().page.margins.left).toBe(120);
    expect(builder.getSchema().page.margins.right).toBe(120);

    orientation.value = 'portrait';
    orientation.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(builder);
    const portrait = builder.getSchema().page;
    expect(portrait.orientation).toBe('portrait');
    expect(210 - portrait.margins.left - portrait.margins.right).toBeGreaterThanOrEqual(50);
    expect(portrait.margins.left).toBeLessThan(120);
    expect(builder.shadowRoot!.querySelector('[data-testid="page-margin-notice"]')?.textContent).toContain('Margins were reduced');
    expect(builder.shadowRoot!.querySelector('#prop-margin-left-error')?.textContent).toContain('Margins were reduced');

    builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="ribbon-btn-landscape"]')!.click();
    await flush(builder);
    setMargin('left', '12');
    setMargin('right', '12');
    await flush(builder);
    builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="ribbon-btn-portrait"]')!.click();
    await flush(builder);
    const fromRibbon = builder.getSchema().page;
    expect(fromRibbon.orientation).toBe('portrait');
    expect(210 - fromRibbon.margins.left - fromRibbon.margins.right).toBeGreaterThanOrEqual(50);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="ribbon-btn-landscape"]')!.click();
    await flush(builder);
    setMargin('left', '12');
    setMargin('right', '12');
    await flush(builder);
    const paper = builder.shadowRoot!.querySelector<HTMLSelectElement>('[data-testid="prop-paper-size"]')!;
    paper.value = 'A5';
    paper.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(builder);
    const a5 = builder.getSchema().page;
    expect(a5.size).toBe('A5');
    expect(a5.orientation).toBe('landscape');
    expect(210 - a5.margins.left - a5.margins.right).toBeGreaterThanOrEqual(50);
    expect(a5.margins.left).toBeLessThan(120);
    expect(builder.shadowRoot!.querySelector('[data-testid="page-margin-notice"]')).toBeTruthy();
  });
});
