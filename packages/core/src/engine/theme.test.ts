import { describe, it, expect } from 'vitest';
import '../components/reports-viewer.js';
import '../components/reports-builder.js';

describe('CSS theme variables', () => {
  it('viewer styles reference --rw-* variables', async () => {
    const viewerModule = await import('../components/reports-viewer.js');
    const ctor = viewerModule.ReportsViewerElement as unknown as { styles: { cssText?: string } | Array<{ cssText?: string }> };
    const css = Array.isArray(ctor.styles) ? ctor.styles.map((s) => s.cssText ?? '').join('\n') : (ctor.styles?.cssText ?? '');
    expect(css).toContain('--rw-bg');
    expect(css).toContain('--rw-accent');
  });

  it('builder styles reference --rb-* variables', async () => {
    const builderModule = await import('../components/reports-builder.js');
    const ctor = builderModule.ReportsBuilderElement as unknown as { styles: { cssText?: string } | Array<{ cssText?: string }> };
    const css = Array.isArray(ctor.styles) ? ctor.styles.map((s) => s.cssText ?? '').join('\n') : (ctor.styles?.cssText ?? '');
    expect(css).toContain('--rb-bg');
    expect(css).toContain('--rb-accent');
  });
});
