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
    id: 'grid',
    meta: { name: 'Grid', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    groups: [],
    bands: {
      detail: {
        height: 20,
        elements: [{ id: 'title', kind: 'text', value: 'تقرير المبيعات الشهري', style: { fontSize: 18, font: 'Cairo' }, pos: { x: 10, y: 2, w: 80, h: 8 } }],
      },
    },
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('property grid editing and RTL digits', () => {
  let builder: ReportsBuilderElement | undefined;
  afterEach(() => builder?.remove());

  it('edits a position live, shows Arabic digits, and undo restores it', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'ar';
    builder.dir = 'rtl';
    builder.schema = schema();
    await flush(builder);
    const element = builder.shadowRoot!.querySelector<HTMLElement>('[data-testid="element-title"]')!;
    element.setPointerCapture = () => undefined;
    element.releasePointerCapture = () => undefined;
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 8, clientY: 8 }));
    await flush(builder);

    const size = builder.shadowRoot!.querySelector<HTMLInputElement>('[data-testid="prop-font-size"]')!;
    expect(size.value).toMatch(/[٠-٩]/);
    expect(builder.shadowRoot!.querySelector('[data-testid="prop-font-family"]')?.tagName).toBe('SELECT');
    expect(builder.shadowRoot!.querySelectorAll('.cat-h').length).toBeGreaterThan(1);
    expect(builder.shadowRoot!.querySelector('.cat.closed')).toBeTruthy();
    expect(builder.shadowRoot!.querySelector('.bool')?.textContent).toContain('لا');

    const x = builder.shadowRoot!.querySelector<HTMLInputElement>('[data-testid="prop-x"]')!;
    x.value = '3.5';
    x.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements[0]?.pos.x).toBe(35);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="ribbon-btn-undo"]')!.click();
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements[0]?.pos.x).toBe(10);
    expect(builder.getAttribute('dir')).toBe('rtl');
  });

  it('BUG-46: property selects fit their closed text', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'ar';
    builder.dir = 'rtl';
    builder.schema = schema();
    await flush(builder);

    const check = (select: HTMLSelectElement) => {
      const cs = getComputedStyle(select);
      expect(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)).toBe(0);
      const line = parseFloat(cs.lineHeight);
      const height = select.getBoundingClientRect().height || parseFloat(cs.height);
      if (Number.isFinite(line) && Number.isFinite(height) && height > 0) expect(line).toBeLessThanOrEqual(height);
      if (select.clientHeight > 0) expect(select.scrollHeight).toBeLessThanOrEqual(select.clientHeight);
      expect((select.selectedOptions[0]?.textContent ?? '').length).toBeGreaterThan(0);
    };

    for (const id of ['prop-paper-size', 'prop-page-orientation', 'prop-locale', 'prop-direction']) {
      check(builder.shadowRoot!.querySelector<HTMLSelectElement>(`[data-testid="${id}"]`)!);
    }

    const element = builder.shadowRoot!.querySelector<HTMLElement>('[data-testid="element-title"]')!;
    element.setPointerCapture = () => undefined;
    element.releasePointerCapture = () => undefined;
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 8, clientY: 8 }));
    await flush(builder);
    const font = builder.shadowRoot!.querySelector<HTMLSelectElement>('[data-testid="prop-font-family"]')!;
    expect(font.selectedOptions[0]?.textContent).toBe('Cairo');
    check(font);
  });

  it('BUG-48: the color swatch is a square', async () => {
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
    const swatch = builder.shadowRoot!.querySelector<HTMLElement>('.color-value input.swatch')!;
    const cs = getComputedStyle(swatch);
    expect(cs.width).toBe(cs.height);
    expect(parseFloat(cs.width)).toBe(16);
    expect(parseFloat(cs.height)).toBe(16);
  });

  it('BUG-51: searching خط shows only matching property rows', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'ar';
    builder.dir = 'rtl';
    builder.schema = schema();
    await flush(builder);
    const element = builder.shadowRoot!.querySelector<HTMLElement>('[data-testid="element-title"]')!;
    element.setPointerCapture = () => undefined;
    element.releasePointerCapture = () => undefined;
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 8, clientY: 8 }));
    await flush(builder);

    const input = builder.shadowRoot!.querySelector<HTMLInputElement>('.prop-search input')!;
    input.value = 'خط';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const rows = [...builder.shadowRoot!.querySelectorAll<HTMLElement>('.prow')];
    const matched = rows.filter((row) => (row.querySelector('.k')?.textContent ?? '').includes('خط'));
    const rest = rows.filter((row) => !(row.querySelector('.k')?.textContent ?? '').includes('خط'));
    expect(matched.length).toBeGreaterThan(0);
    expect(rest.length).toBeGreaterThan(0);
    for (const row of matched) {
      expect(row.hidden).toBe(false);
      expect(getComputedStyle(row).display).not.toBe('none');
    }
    for (const row of rest) {
      expect(row.hidden).toBe(true);
      expect(getComputedStyle(row).display).toBe('none');
    }
  });
});
