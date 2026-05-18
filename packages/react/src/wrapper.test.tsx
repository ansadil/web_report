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
