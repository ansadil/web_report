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

  it('registers custom elements on import', () => {
    expect(customElements.get('reports-viewer')).toBeTruthy();
    expect(customElements.get('reports-builder')).toBeTruthy();
  });
});
