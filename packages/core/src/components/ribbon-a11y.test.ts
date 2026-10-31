import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './reports-builder.js';
import type { ReportsBuilderElement } from './reports-builder.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
}

describe('ribbon tabs and toolbox insert', () => {
  let b: ReportsBuilderElement;

  beforeEach(async () => {
    b = document.createElement('reports-builder') as ReportsBuilderElement;
    document.body.appendChild(b);
    await flush(b);
  });

  afterEach(() => {
    b.remove();
  });

  it('exposes a tablist with roving tabindex and a matching tabpanel', () => {
    const root = b.shadowRoot!;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.dataset.testid)).toEqual([
      'ribbon-tab-file',
      'ribbon-tab-home',
      'ribbon-tab-insert',
      'ribbon-tab-layout',
      'ribbon-tab-page',
      'ribbon-tab-view',
      'ribbon-tab-preview',
    ]);
    const home = root.querySelector<HTMLButtonElement>('#ribbon-tab-home')!;
    expect(home.getAttribute('aria-selected')).toBe('true');
    expect(home.tabIndex).toBe(0);
    expect(home.getAttribute('aria-controls')).toBe('ribbon-panel-home');
    expect(root.querySelector('#ribbon-tab-file')!.tabIndex).toBe(-1);
    const panel = root.querySelector('#ribbon-panel-home')!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('ribbon-tab-home');
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('#ribbon-panel-insert')!.hasAttribute('hidden')).toBe(true);
  });

  it('moves the selected tab with arrows, Home, and End', async () => {
    const root = b.shadowRoot!;
    const home = root.querySelector<HTMLButtonElement>('#ribbon-tab-home')!;
    home.focus();
    home.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await flush(b);
    expect(root.querySelector('#ribbon-tab-insert')!.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('#ribbon-tab-insert')!.tabIndex).toBe(0);
    expect(document.activeElement === b ? root.activeElement : document.activeElement).toBe(root.querySelector('#ribbon-tab-insert'));

    root.querySelector<HTMLButtonElement>('#ribbon-tab-insert')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    await flush(b);
    expect(root.querySelector('#ribbon-tab-preview')!.getAttribute('aria-selected')).toBe('true');

    root.querySelector<HTMLButtonElement>('#ribbon-tab-preview')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    await flush(b);
    expect(root.querySelector('#ribbon-tab-file')!.getAttribute('aria-selected')).toBe('true');
  });

  it('mirrors horizontal arrows when the UI is RTL', async () => {
    const schema = b.getSchema();
    b.setSchema({ ...schema, meta: { ...schema.meta, dir: 'rtl' } });
    await flush(b);
    const root = b.shadowRoot!;
    const home = root.querySelector<HTMLButtonElement>('#ribbon-tab-home')!;
    home.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await flush(b);
    expect(root.querySelector('#ribbon-tab-insert')!.getAttribute('aria-selected')).toBe('true');
    root.querySelector<HTMLButtonElement>('#ribbon-tab-insert')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    await flush(b);
    expect(root.querySelector('#ribbon-tab-home')!.getAttribute('aria-selected')).toBe('true');
  });

  it('inserts a toolbox tool into the detail band, or the selected band', async () => {
    const root = b.shadowRoot!;
    const text = root.querySelector<HTMLButtonElement>('[data-testid="tool-text"]')!;
    expect(text.tabIndex).toBe(0);
    text.click();
    await flush(b);
    expect(b.getSchema().bands.detail.elements.map((el) => el.kind)).toEqual(['text']);

    const header = b.getSchema();
    header.bands.pageHeader = {
      height: 12,
      elements: [{ id: 'ph1', kind: 'text', value: 'H', pos: { x: 0, y: 0, w: 20, h: 5 }, style: { fontSize: 10, color: '#111111' } }],
    };
    b.setSchema(header);
    await flush(b);
    const proto = HTMLElement.prototype;
    const prevSet = proto.setPointerCapture;
    const prevRelease = proto.releasePointerCapture;
    proto.setPointerCapture = () => {};
    proto.releasePointerCapture = () => {};
    try {
      root.querySelector<HTMLElement>('[data-testid="element-ph1"]')!.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
      );
      await flush(b);
      root.querySelector<HTMLButtonElement>('[data-testid="tool-field"]')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      await flush(b);
    } finally {
      proto.setPointerCapture = prevSet;
      proto.releasePointerCapture = prevRelease;
    }
    const pageHeader = b.getSchema().bands.pageHeader?.elements ?? [];
    expect(pageHeader.filter((el) => el.kind === 'field')).toHaveLength(1);
    expect(b.getSchema().bands.detail.elements.map((el) => el.kind)).toEqual(['text']);
  });

  it('formats the home zoom and font size with the UI locale', async () => {
    b.locale = 'ar';
    await flush(b);
    const root = b.shadowRoot!;
    expect(root.querySelector('[data-testid="ribbon-btn-zoom-reset"]')!.textContent).toMatch(/[٠-٩]/);
    expect(root.querySelector<HTMLInputElement>('[data-testid="ribbon-font-size"]')!.value).toMatch(/[٠-٩]/);
    const schema = b.getSchema();
    b.setSchema({ ...schema, meta: { ...schema.meta, pageNumberDigits: 'latn' } });
    await flush(b);
    expect(root.querySelector('[data-testid="ribbon-btn-zoom-reset"]')!.textContent).toBe('100%');
    expect(root.querySelector<HTMLInputElement>('[data-testid="ribbon-font-size"]')!.value).toBe('10');
  });

  it('does not render the actions side section', () => {
    expect(b.shadowRoot!.querySelector('[data-section="actions"]')).toBeNull();
    expect(b.shadowRoot!.querySelector('[data-testid="toolbox"]')).toBeTruthy();
  });
});
