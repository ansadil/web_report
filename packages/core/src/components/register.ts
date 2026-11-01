import { ReportsBuilderElement } from './reports-builder.js';
import { ReportsViewerElement } from './reports-viewer.js';

/**
 * Register `<reports-viewer>` and `<reports-builder>`.
 * Safe to import this module during SSR: registration runs only when `window` exists.
 */
export function defineReportsElements(): void {
  if (typeof window === 'undefined') return;
  if (!customElements.get('reports-viewer')) customElements.define('reports-viewer', ReportsViewerElement);
  if (!customElements.get('reports-builder')) customElements.define('reports-builder', ReportsBuilderElement);
}
