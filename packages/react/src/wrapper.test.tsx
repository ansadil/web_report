import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ReportViewer, ReportBuilder } from './index.js';

describe('React wrappers', () => {
  it('ReportViewer renders the custom element tag', () => {
    const html = renderToString(createElement(ReportViewer, { schema: null }));
    expect(html).toContain('reports-viewer');
  });

  it('ReportBuilder renders the custom element tag', () => {
    const html = renderToString(createElement(ReportBuilder, {}));
    expect(html).toContain('reports-builder');
  });

  it('registers custom elements on import', () => {
    expect(customElements.get('reports-viewer')).toBeTruthy();
    expect(customElements.get('reports-builder')).toBeTruthy();
  });
});

describe('React ReportViewer params prop', () => {
  it('passes params to the element and forwards parameters-error', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const errors: unknown[] = [];
    await act(async () => {
      root.render(createElement(ReportViewer, { schema: null, params: { year: 2026 }, onParametersError: (d) => errors.push(d) }));
    });
    const el = host.querySelector('reports-viewer') as HTMLElement & { params: unknown };
    expect(el.params).toEqual({ year: 2026 });
    await act(async () => {
      root.render(createElement(ReportViewer, { schema: null, params: { year: 2027 }, onParametersError: (d) => errors.push(d) }));
    });
    expect(el.params).toEqual({ year: 2027 });
    el.dispatchEvent(new CustomEvent('parameters-error', { detail: { error: 'x', issues: [] } }));
    expect(errors).toEqual([{ error: 'x', issues: [] }]);
    await act(async () => {
      root.render(createElement(ReportViewer, { schema: null, fontsBaseUrl: 'https://fonts.example/faces/', timeZone: 'UTC', dateFormatHint: 'DD/MM/YYYY' }));
    });
    const viewer = host.querySelector('reports-viewer') as HTMLElement & { fontsBaseUrl?: string; timeZone?: string; dateFormatHint?: string };
    expect(viewer.fontsBaseUrl).toBe('https://fonts.example/faces/');
    expect(viewer.timeZone).toBe('UTC');
    expect(viewer.dateFormatHint).toBe('DD/MM/YYYY');
    await act(async () => {
      root.render(createElement(ReportBuilder, { fontsBaseUrl: 'https://fonts.example/builder/' }));
    });
    const builder = host.querySelector('reports-builder') as HTMLElement & { fontsBaseUrl?: string };
    expect(builder.fontsBaseUrl).toBe('https://fonts.example/builder/');
    await act(async () => root.unmount());
    host.remove();
  });

  it('forwards time-zone-invalid as onTimeZoneInvalid (BUG-59)', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const invalid: unknown[] = [];
    const paramErrors: unknown[] = [];
    await act(async () => {
      root.render(
        createElement(ReportViewer, {
          schema: null,
          timeZone: 'Mars/Olympus',
          onTimeZoneInvalid: (d) => invalid.push(d),
          onParametersError: (d) => paramErrors.push(d),
        }),
      );
    });
    await act(async () => {
      await (host.querySelector('reports-viewer') as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    });
    expect(invalid).toEqual([{ timeZone: 'Mars/Olympus', fallback: 'Asia/Riyadh' }]);
    expect(paramErrors).toEqual([]);
    await act(async () => root.unmount());
    host.remove();
  });
});
