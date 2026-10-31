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
});
