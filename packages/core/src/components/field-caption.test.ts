import { describe, it, expect, afterEach } from 'vitest';
import './reports-builder.js';
import type { ReportsBuilderElement } from './reports-builder.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
}

function report(dir: 'ltr' | 'rtl' = 'ltr'): ReportSchemaV1 {
  const result = validateReport({
    version: '1',
    id: 'bug-42',
    meta: { name: 'Direction', locale: 'en', dir },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataset: { adapter: 'static', source: 'sales' },
    fields: [
      { name: 'product', type: 'string', label: 'الصنف' },
      { name: 'qty', type: 'number' },
    ],
    groups: [],
    bands: {
      detail: {
        height: 24,
        elements: [
          { id: 'd1', kind: 'field', field: 'product', pos: { x: 0, y: 0, w: 40, h: 6 } },
          { id: 'd2', kind: 'field', field: 'qty', pos: { x: 42, y: 0, w: 20, h: 6 } },
          { id: 'd3', kind: 'field', field: 'missing', pos: { x: 64, y: 0, w: 24, h: 6 } },
          { id: 'c1', kind: 'chart', type: 'bar', labelsField: 'product', valueField: 'qty', pos: { x: 0, y: 8, w: 50, h: 10 } },
        ],
      },
    },
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('BUG-42 field captions and BUG-43 canvas direction', () => {
  let builder: ReportsBuilderElement | undefined;

  afterEach(() => builder?.remove());

  it('BUG-42 shows a dictionary caption, otherwise the field name, and a generic placeholder when unbound', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.locale = 'ar';
    builder.schema = report();
    await flush(builder);
    const text = (id: string) => builder!.shadowRoot!.querySelector(`[data-testid="element-${id}"] .el-body`)?.textContent;
    expect(text('d1')).toBe('[الصنف]');
    expect(text('d2')).toBe('[qty]');
    expect(text('d3')).toBe('[حقل]');
    expect(text('c1')).toBe('رسم بياني عمودي');
  });

  it('BUG-43 follows meta.dir on the canvas and the UI language on the chrome', async () => {
    builder = document.createElement('reports-builder');
    document.body.appendChild(builder);
    builder.schema = report('ltr');
    builder.locale = 'ar';
    builder.dir = 'rtl';
    await flush(builder);
    expect(builder.shadowRoot!.querySelector('[data-testid="canvas"]')?.getAttribute('dir')).toBe('ltr');
    expect(builder.getAttribute('dir')).toBe('rtl');

    builder.schema = report('rtl');
    builder.locale = 'ar';
    builder.dir = 'rtl';
    await flush(builder);
    builder.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="title-locale"]')!.click();
    await flush(builder);
    expect(builder.getSchema().meta.dir).toBe('rtl');
    expect(builder.shadowRoot!.querySelector('[data-testid="canvas"]')?.getAttribute('dir')).toBe('rtl');
    expect(builder.getAttribute('dir')).toBe('ltr');
  });
});
