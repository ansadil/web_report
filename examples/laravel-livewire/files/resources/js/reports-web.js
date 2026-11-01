import '@reports-web/core/viewer';
import '@reports-web/core/builder';
import { dateFormatHintFor } from '@reports-web/core';

function hintForReportLocale(locale) {
  return dateFormatHintFor(String(locale ?? 'en').replace(/_/g, '-'));
}

/**
 * Called from Livewire `@script` after the custom element is registered.
 * @param {{ elementId: string; schema: object; rows: object[]; locale?: string; dir?: string }} opts
 */
window.mountInvoiceReportViewer = function mountInvoiceReportViewer(opts) {
  const { elementId, schema, rows, locale = 'en', dir = 'ltr' } = opts;
  void customElements.whenDefined('reports-viewer').then(() => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.schema = schema;
    el.rows = rows;
    el.locale = locale;
    el.dateFormatHint = hintForReportLocale(schema?.meta?.locale ?? locale);
    el.dir = dir;
  });
};

/**
 * Mount `<reports-builder>` with optional starter schema and demo rows for field introspection.
 * Uses dataset source `rows` inside the builder; pass rows compatible with that source.
 * @param {{ elementId: string; schema?: object|null; sampleRows?: object[]; locale?: string; dir?: string }} opts
 * @returns {Promise<void>}
 */
window.mountReportBuilder = async function mountReportBuilder(opts) {
  const { elementId, schema = null, sampleRows = [], locale = 'en', dir = 'ltr' } = opts;
  await customElements.whenDefined('reports-builder');
  const el = document.getElementById(elementId);
  if (!el) return;
  el.schema = schema;
  el.sampleRows = sampleRows;
  el.locale = locale;
  el.dir = dir;
};
