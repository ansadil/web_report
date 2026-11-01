import { describe, it, expect } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ReportViewer, ReportBuilder } from './index.js';

describe('Vue wrappers', () => {
  it('ReportViewer renders the custom element tag', async () => {
    const app = createSSRApp({ render: () => h(ReportViewer, { schema: null }) });
    const html = await renderToString(app);
    expect(html).toContain('reports-viewer');
  });

  it('ReportBuilder renders the custom element tag', async () => {
    const app = createSSRApp({ render: () => h(ReportBuilder) });
    const html = await renderToString(app);
    expect(html).toContain('reports-builder');
  });

  it('registers custom elements when the client components mount', async () => {
    const { createApp, nextTick } = await import('vue');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h('div', null, [h(ReportViewer, { schema: null }), h(ReportBuilder)]),
    });
    app.mount(host);
    await nextTick();
    expect(customElements.get('reports-viewer')).toBeTruthy();
    expect(customElements.get('reports-builder')).toBeTruthy();
    app.unmount();
    host.remove();
  });
});

describe('Vue ReportViewer params prop', () => {
  it('passes params to the element, updates on change and emits parameters-error', async () => {
    const { createApp, nextTick, ref } = await import('vue');
    const params = ref<Record<string, unknown>>({ year: 2026 });
    const errors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(ReportViewer, { schema: null, params: params.value, onParametersError: (d: unknown) => errors.push(d) }),
    });
    app.mount(host);
    await nextTick();
    const el = host.querySelector('reports-viewer') as HTMLElement & { params: unknown };
    expect(el.params).toEqual({ year: 2026 });
    params.value = { year: 2027 };
    await nextTick();
    await nextTick();
    expect(el.params).toEqual({ year: 2027 });
    const fontHost = document.createElement('div');
    document.body.appendChild(fontHost);
    const fontApp = createApp({
      render: () => h(ReportViewer, { schema: null, fontsBaseUrl: 'https://fonts.example/faces/', timeZone: 'UTC', dateFormatHint: 'DD/MM/YYYY' }),
    });
    fontApp.mount(fontHost);
    await nextTick();
    const viewer = fontHost.querySelector('reports-viewer') as HTMLElement & { fontsBaseUrl?: string; timeZone?: string; dateFormatHint?: string };
    expect(viewer.fontsBaseUrl).toBe('https://fonts.example/faces/');
    expect(viewer.timeZone).toBe('UTC');
    expect(viewer.dateFormatHint).toBe('DD/MM/YYYY');
    const builderHost = document.createElement('div');
    document.body.appendChild(builderHost);
    const builderApp = createApp({
      render: () => h(ReportBuilder, { fontsBaseUrl: 'https://fonts.example/builder/' }),
    });
    builderApp.mount(builderHost);
    await nextTick();
    const builder = builderHost.querySelector('reports-builder') as HTMLElement & { fontsBaseUrl?: string };
    expect(builder.fontsBaseUrl).toBe('https://fonts.example/builder/');
    fontApp.unmount();
    builderApp.unmount();
    fontHost.remove();
    builderHost.remove();
    el.dispatchEvent(new CustomEvent('parameters-error', { detail: { error: 'x', issues: [] } }));
    expect(errors).toEqual([{ error: 'x', issues: [] }]);
    app.unmount();
    host.remove();
  });

  it('emits time-zone-invalid for an unknown zone (BUG-59)', async () => {
    const { createApp, nextTick } = await import('vue');
    const invalid: unknown[] = [];
    const paramErrors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(ReportViewer, {
          schema: null,
          timeZone: 'Mars/Olympus',
          onTimeZoneInvalid: (d: unknown) => invalid.push(d),
          onParametersError: (d: unknown) => paramErrors.push(d),
        }),
    });
    app.mount(host);
    await nextTick();
    await (host.querySelector('reports-viewer') as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    expect(invalid).toEqual([{ timeZone: 'Mars/Olympus', fallback: 'Asia/Riyadh' }]);
    expect(paramErrors).toEqual([]);
    app.unmount();
    host.remove();
  });
});
