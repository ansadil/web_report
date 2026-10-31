import { describe, it, expect, beforeEach } from 'vitest';
import './reports-viewer.js';
import './reports-builder.js';
import type { ReportsViewerElement } from './reports-viewer.js';
import type { ReportsBuilderElement } from './reports-builder.js';
import { validateReport } from '../schema/report-schema.js';
import { MM_TO_PX } from '@reports-web/shared';
import { lineThicknessMm } from '../engine/line-layout.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
}

function dispatchBuilderKey(el: HTMLElement, key: string, opts: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...opts }));
}

function builderSchemaWithElement() {
  const schema = validateReport({
    version: '1',
    id: 'shortcut-test',
    meta: { name: 'Shortcut Test', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    groups: [],
    bands: {
      detail: {
        height: 30,
        elements: [{ id: 'text-1', kind: 'text', value: 'Text', pos: { x: 5, y: 5, w: 30, h: 8 } }],
      },
    },
  });
  if (!schema.ok) throw new Error(schema.error);
  return schema.value;
}

function builderSchemaWithTwoElements() {
  const schema = validateReport({
    version: '1',
    id: 'marquee-test',
    meta: { name: 'Marquee Test', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    groups: [],
    bands: {
      detail: {
        height: 40,
        elements: [
          { id: 'text-1', kind: 'text', value: 'One', pos: { x: 5, y: 5, w: 30, h: 8 } },
          { id: 'text-2', kind: 'text', value: 'Two', pos: { x: 45, y: 10, w: 30, h: 8 } },
        ],
      },
    },
  });
  if (!schema.ok) throw new Error(schema.error);
  return schema.value;
}

async function selectFirstBuilderElement(builder: ReportsBuilderElement): Promise<void> {
  const element = builder.shadowRoot!.querySelector<HTMLElement>('.element')!;
  element.setPointerCapture = () => undefined;
  element.releasePointerCapture = () => undefined;
  const ev = new Event('pointerdown', { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(ev, {
    clientX: { value: 10 },
    clientY: { value: 10 },
    pointerId: { value: 1 },
  });
  element.dispatchEvent(ev);
  await flush(builder);
}

function dispatchPointer(target: HTMLElement, type: string, props: Record<string, unknown>): void {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(ev, {
    button: { value: 0 },
    buttons: { value: 1 },
    pointerId: { value: 1 },
    ...Object.fromEntries(Object.entries(props).map(([key, value]) => [key, { value }])),
  });
  target.dispatchEvent(ev);
}

describe('reports-viewer toolbar', () => {
  let v: ReportsViewerElement;
  beforeEach(() => {
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
  });

  it('renders the full default set of export buttons', async () => {
    await flush(v);
    const buttons = v.shadowRoot!.querySelectorAll('.toolbar button[data-action]');
    const ids = Array.from(buttons).map((b) => b.getAttribute('data-action'));
    expect(ids).toEqual(expect.arrayContaining(['print', 'pdf', 'excel', 'image']));
  });

  it('honors a custom actions list', async () => {
    v.actions = ['pdf', 'csv'];
    await flush(v);
    const buttons = v.shadowRoot!.querySelectorAll('.toolbar button[data-action]');
    const ids = Array.from(buttons).map((b) => b.getAttribute('data-action'));
    expect(ids).toEqual(['pdf', 'csv']);
  });

  it('hides toolbar entirely when no-toolbar is set', async () => {
    v.noToolbar = true;
    await flush(v);
    const toolbar = v.shadowRoot!.querySelector('.toolbar');
    expect(toolbar).toBeNull();
  });
});

describe('reports-builder toolbar + collapsible panels', () => {
  let b: ReportsBuilderElement;
  beforeEach(() => {
    b = document.createElement('reports-builder') as ReportsBuilderElement;
    document.body.appendChild(b);
  });

  it('renders the default toolbar actions (save, json)', async () => {
    await flush(b);
    const buttons = b.shadowRoot!.querySelectorAll('button[data-action]');
    const ids = Array.from(buttons).map((b) => b.getAttribute('data-action'));
    expect(ids).toEqual(expect.arrayContaining(['save', 'json']));
  });

  it('honors a custom actions list', async () => {
    b.actions = ['save'];
    await flush(b);
    const buttons = b.shadowRoot!.querySelectorAll('button[data-action]');
    const ids = Array.from(buttons).map((bn) => bn.getAttribute('data-action'));
    expect(ids).toEqual(['save']);
  });

  it('renders one left dock with collapsible sections', async () => {
    await flush(b);
    expect(b.shadowRoot!.querySelector('aside.left')?.classList.contains('collapsed')).toBe(false);
    expect(b.shadowRoot!.querySelector('aside.right')).toBeNull();
    expect(b.shadowRoot!.querySelector('[data-section="actions"]')).toBeNull();
    expect(b.shadowRoot!.querySelector('[data-section="tools"]')).toBeTruthy();
    expect(b.shadowRoot!.querySelector('[data-section="properties"]')).toBeTruthy();
  });

  it('toggles a side panel when the toggle button is clicked', async () => {
    await flush(b);
    const toggleLeft = b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-left"]');
    expect(toggleLeft).toBeTruthy();
    toggleLeft!.click();
    await flush(b);
    expect(b.shadowRoot!.querySelector('aside.left')?.classList.contains('collapsed')).toBe(true);
    toggleLeft!.click();
    await flush(b);
    expect(b.shadowRoot!.querySelector('aside.left')?.classList.contains('collapsed')).toBe(false);
  });

  it('toggles side dock sections independently', async () => {
    await flush(b);
    const toggleTools = b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-tools"]');
    expect(toggleTools).toBeTruthy();
    expect(toggleTools!.getAttribute('aria-expanded')).toBe('true');
    toggleTools!.click();
    await flush(b);
    expect(b.shadowRoot!.querySelector('button[data-control="toggle-section-tools"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(b.shadowRoot!.querySelector('[data-section="tools"] .section-body')).toBeNull();
  });

  it('toolbar buttons carry aria-labels for accessibility', async () => {
    await flush(b);
    const saveBtn = b.shadowRoot!.querySelector('button[data-action="save"]');
    expect(saveBtn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('supports undo and redo from toolbar controls', async () => {
    await flush(b);
    const undo = b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="undo"]')!;
    const redo = b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="redo"]')!;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    const name = b.shadowRoot!.querySelector<HTMLInputElement>('input.name')!;
    name.value = 'Changed report';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(b);
    expect(b.getSchema().meta.name).toBe('Changed report');
    expect(b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="undo"]')!.disabled).toBe(false);

    b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="undo"]')!.click();
    await flush(b);
    expect(b.getSchema().meta.name).toBe('Untitled Report');
    expect(b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="redo"]')!.disabled).toBe(false);

    b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="redo"]')!.click();
    await flush(b);
    expect(b.getSchema().meta.name).toBe('Changed report');
  });

  it('zooms the builder canvas from action controls', async () => {
    await flush(b);
    const zoomValue = b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="zoom-reset"]')!;
    expect(zoomValue.textContent).toBe('100%');

    b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="zoom-in"]')!.click();
    await flush(b);
    expect(b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="zoom-reset"]')!.textContent).toBe('110%');
    expect(b.shadowRoot!.querySelector<HTMLElement>('.canvas')!.getAttribute('style')).toContain('transform:scale(1.1)');

    b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="zoom-reset"]')!.click();
    await flush(b);
    expect(b.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="zoom-reset"]')!.textContent).toBe('100%');
    expect(b.shadowRoot!.querySelector<HTMLElement>('.canvas')!.getAttribute('style')).toContain('transform:scale(1)');
  });

  it('renders resize handles for a selected richtext element', async () => {
    const schema = validateReport({
      version: '1',
      id: 'richtext-resize',
      meta: { name: 'Rich', locale: 'en', dir: 'ltr' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 'rows' },
      fields: [],
      groups: [],
      bands: {
        detail: {
          height: 30,
          elements: [
            {
              id: 'rich-1',
              kind: 'richtext',
              mode: 'html',
              content: '<p>Hello <name></p>',
              pos: { x: 5, y: 5, w: 50, h: 20 },
            },
          ],
        },
      },
    });
    if (!schema.ok) throw new Error(schema.error);

    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = schema.value;
    document.body.appendChild(builder);
    await flush(builder);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-properties"]')!.click();
    await flush(builder);

    await selectFirstBuilderElement(builder);

    const el = builder.shadowRoot!.querySelector<HTMLElement>('.element.richtext.selected')!;
    expect(el).toBeTruthy();
    expect(getComputedStyle(el).overflow).toBe('visible');
    expect(builder.shadowRoot!.querySelectorAll('.resize-handle')).toHaveLength(8);
  });

  it('renders resize handles for a selected element', async () => {
    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = builderSchemaWithElement();
    document.body.appendChild(builder);
    await flush(builder);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-properties"]')!.click();
    await flush(builder);

    await selectFirstBuilderElement(builder);

    const handles = builder.shadowRoot!.querySelectorAll('.resize-handle');
    expect(handles.length).toBe(8);
    expect(Array.from(handles).map((h) => h.className)).toEqual(
      expect.arrayContaining(['resize-handle resize-n', 'resize-handle resize-se', 'resize-handle resize-sw']),
    );
  });

  it('renders compact icon-only toolbox grid', async () => {
    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = builderSchemaWithElement();
    document.body.appendChild(builder);
    await flush(builder);

    const grid = builder.shadowRoot!.querySelector('.tool-grid') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(getComputedStyle(grid).gridTemplateColumns).toContain('repeat(3');
    const tools = grid.querySelectorAll('.tool');
    expect(tools.length).toBe(12);
    expect(tools[0]!.getAttribute('title')).toBe('Text');
    expect(tools[0]!.getAttribute('aria-label')).toBe('Text');
  });

  it('renders line element stroke inside pos bounds', async () => {
    const schema = validateReport({
      version: '1',
      id: 'line-builder',
      meta: { name: 'Line', locale: 'en', dir: 'ltr' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 'rows' },
      fields: [],
      groups: [],
      bands: {
        detail: {
          height: 30,
          elements: [
            {
              id: 'ln1',
              kind: 'line',
              orientation: 'horizontal',
              thickness: 2,
              pos: { x: 10, y: 4, w: 60, h: 0.71 },
            },
          ],
        },
      },
    });
    if (!schema.ok) throw new Error(schema.error);

    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = schema.value;
    document.body.appendChild(builder);
    await flush(builder);

    const el = builder.shadowRoot!.querySelector<HTMLElement>('.element.line')!;
    expect(el).toBeTruthy();
    const stroke = el.querySelector<HTMLElement>('.line-stroke')!;
    expect(stroke).toBeTruthy();
    expect(parseFloat(el.style.width)).toBeCloseTo(60 * MM_TO_PX, 3);
    expect(parseFloat(el.style.height)).toBeCloseTo(lineThicknessMm(2) * MM_TO_PX, 3);
    expect(stroke.style.width).toBe('100%');
    expect(stroke.style.height).toBe('100%');
  });

  it('nudges selected elements with arrow keys', async () => {
    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = builderSchemaWithElement();
    document.body.appendChild(builder);
    await flush(builder);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-properties"]')!.click();
    await flush(builder);
    await selectFirstBuilderElement(builder);
    builder.focus();

    const before = builder.getSchema().bands.detail.elements[0]!.pos;
    dispatchBuilderKey(builder, 'ArrowRight');
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements[0]!.pos.x).toBe(before.x + 1);
    expect(builder.getSchema().bands.detail.elements[0]!.pos.y).toBe(before.y);

    dispatchBuilderKey(builder, 'ArrowDown', { shiftKey: true });
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements[0]!.pos.y).toBe(before.y + 5);
  });

  it('supports element copy, paste, cut, delete, and escape shortcuts', async () => {
    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = builderSchemaWithElement();
    document.body.appendChild(builder);
    await flush(builder);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-properties"]')!.click();
    await flush(builder);

    await selectFirstBuilderElement(builder);
    dispatchBuilderKey(builder, 'c', { ctrlKey: true });
    dispatchBuilderKey(builder, 'v', { ctrlKey: true });
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements).toHaveLength(2);
    expect(builder.shadowRoot!.querySelectorAll('.resize-handle')).toHaveLength(8);

    dispatchBuilderKey(builder, 'Escape');
    await flush(builder);
    expect(builder.shadowRoot!.querySelectorAll('.element.selected')).toHaveLength(0);

    await selectFirstBuilderElement(builder);
    dispatchBuilderKey(builder, 'Delete');
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements).toHaveLength(1);

    await selectFirstBuilderElement(builder);
    dispatchBuilderKey(builder, 'x', { ctrlKey: true });
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements).toHaveLength(0);

    dispatchBuilderKey(builder, 'v', { ctrlKey: true });
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements).toHaveLength(1);
    expect(builder.getSchema().bands.detail.elements[0]!.id).not.toBe('text-1');
  });

  it('selects multiple elements with a drag marquee', async () => {
    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = builderSchemaWithTwoElements();
    document.body.appendChild(builder);
    await flush(builder);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-properties"]')!.click();
    await flush(builder);

    const band = builder.shadowRoot!.querySelector<HTMLElement>('.band')!;
    band.setPointerCapture = () => undefined;
    band.releasePointerCapture = () => undefined;

    dispatchPointer(band, 'pointerdown', { clientX: 0, clientY: 0 });
    dispatchPointer(band, 'pointermove', { clientX: 400, clientY: 120 });
    await flush(builder);
    expect(builder.shadowRoot!.querySelector('.marquee')).toBeTruthy();
    expect(builder.shadowRoot!.querySelectorAll('.element.selected')).toHaveLength(2);

    dispatchPointer(band, 'pointerup', { clientX: 400, clientY: 120 });
    await flush(builder);
    expect(builder.shadowRoot!.querySelector('.marquee')).toBeNull();
    expect(builder.shadowRoot!.querySelectorAll('.element.selected')).toHaveLength(2);
    expect(builder.shadowRoot!.querySelectorAll('.resize-handle')).toHaveLength(0);
  });

  it('opens band context menu on right-click with paste and remove band', async () => {
    const schema = validateReport({
      version: '1',
      id: 'band-ctx',
      meta: { name: 'Band ctx', locale: 'en', dir: 'ltr' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 'rows' },
      fields: [],
      groups: [],
      bands: {
        pageHeader: { height: 12, elements: [] },
        detail: { height: 30, elements: [{ id: 't1', kind: 'text', value: 'Hi', pos: { x: 5, y: 5, w: 30, h: 8 } }] },
      },
    });
    if (!schema.ok) throw new Error(schema.error);

    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = schema.value;
    document.body.appendChild(builder);
    await flush(builder);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-properties"]')!.click();
    await flush(builder);

    const pageHeaderBand = builder.shadowRoot!.querySelector<HTMLElement>('.band')!;
    pageHeaderBand.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
    await flush(builder);

    const menu = builder.shadowRoot!.querySelector('.ctx-menu');
    expect(menu).toBeTruthy();
    expect(menu!.querySelector('button[data-ctx="removeSection"]')).toBeTruthy();
    expect(menu!.querySelector('button[data-ctx="copy"][disabled]')).toBeTruthy();

    menu!.querySelector<HTMLButtonElement>('button[data-ctx="removeSection"]')!.click();
    await flush(builder);
    expect(builder.getSchema().bands.pageHeader).toBeUndefined();
    expect(builder.shadowRoot!.querySelector('.ctx-menu')).toBeNull();
  });

  it('opens element context menu on right-click with layer commands', async () => {
    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = builderSchemaWithTwoElements();
    document.body.appendChild(builder);
    await flush(builder);

    builder.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="toggle-section-properties"]')!.click();
    await flush(builder);

    const target = builder.shadowRoot!.querySelector<HTMLElement>('.band .element')!;
    dispatchPointer(target, 'pointerdown', { clientX: 120, clientY: 80, button: 2, buttons: 2 });
    await flush(builder);
    const menu = builder.shadowRoot!.querySelector('.ctx-menu');
    expect(menu).toBeTruthy();
    expect(menu!.querySelectorAll('button[role="menuitem"]').length).toBe(8);
    expect(menu!.querySelector('button[data-ctx="paste"][disabled]')).toBeTruthy();

    menu!.querySelector<HTMLButtonElement>('button[data-ctx="bringToFront"]')!.click();
    await flush(builder);
    expect(builder.getSchema().bands.detail.elements.map((e) => e.id)).toEqual(['text-2', 'text-1']);
    expect(builder.shadowRoot!.querySelector('.ctx-menu')).toBeNull();
  });

  it('applies border style on canvas elements for design preview', async () => {
    const schema = validateReport({
      version: '1',
      id: 'border-preview',
      meta: { name: 'Border', locale: 'en', dir: 'ltr' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 'rows' },
      fields: [],
      groups: [],
      bands: {
        detail: {
          height: 30,
          elements: [
            {
              id: 'boxed',
              kind: 'text',
              value: 'Bordered',
              style: { border: { top: 2, right: 1, bottom: 2, left: 1, color: '#dc2626' }, padding: 2 },
              pos: { x: 5, y: 5, w: 40, h: 12 },
            },
          ],
        },
      },
    });
    if (!schema.ok) throw new Error(schema.error);

    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = schema.value;
    document.body.appendChild(builder);
    await flush(builder);

    const el = builder.shadowRoot!.querySelector<HTMLElement>('.element')!;
    expect(el.style.borderTop).toContain('2pt');
    expect(el.style.borderTop).toContain('#dc2626');
    expect(el.style.padding).toBe('2mm');
  });

  it('suppresses the native browser context menu on the canvas', async () => {
    const builder = document.createElement('reports-builder') as ReportsBuilderElement;
    builder.schema = builderSchemaWithElement();
    document.body.appendChild(builder);
    await flush(builder);

    const canvas = builder.shadowRoot!.querySelector<HTMLElement>('.canvas')!;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
