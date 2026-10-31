import { createStaticAdapter, logger, resolveLabel, validateReport } from '../api.js';
import type { ReportSchemaV1 } from '../api.js';
import { emptySchema } from '../factory.js';
import { newId } from '../ids.js';
import type { BuilderSession } from '../session.js';
import { clearSelection, replaceSchema } from './commands.js';

export async function loadFields(session: BuilderSession): Promise<void> {
  if (session.schema.fields.length > 0) {
    session.fields = session.schema.fields.map((f) => ({ name: f.name, type: f.type, label: f.label }));
    return;
  }
  const adapter =
    session.dataAdapter ??
    (session.sampleRows
      ? createStaticAdapter({ tables: { [session.schema.dataset.source]: session.sampleRows.slice() } })
      : null);
  if (!adapter || !adapter.introspect) return;
  try {
    const fields = await adapter.introspect({ source: session.schema.dataset.source });
    session.fields = fields;
    replaceSchema(session, {
      ...session.schema,
      fields: fields.map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label === undefined ? undefined : resolveLabel(f.label, session.uiLocale),
      })),
    });
  } catch (e) {
    logger.warn('reports-builder', 'introspect failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

export async function saveReport(session: BuilderSession): Promise<void> {
  const v = validateReport(session.schema);
  if (!v.ok) {
    logger.error('reports-builder', 'invalid schema on save', { error: v.error });
    session.dispatchEvent(new CustomEvent('save-error', { detail: { error: v.error } }));
    return;
  }
  const finalSchema: ReportSchemaV1 = {
    ...v.value,
    meta: { ...v.value.meta, updatedAt: new Date().toISOString() },
  };
  replaceSchema(session, finalSchema);
  if (session.storageAdapter) {
    try {
      await session.storageAdapter.save(finalSchema.id, finalSchema);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('reports-builder', 'storage save failed', { error: msg });
      session.dispatchEvent(new CustomEvent('save-error', { detail: { error: msg } }));
      return;
    }
  }
  session.dispatchEvent(new CustomEvent('save', { detail: { schema: finalSchema } }));
}

export function newReport(session: BuilderSession): void {
  const fresh = emptySchema();
  fresh.meta = {
    ...fresh.meta,
    locale: session.schema.meta.locale,
    dir: session.schema.meta.dir,
    ...(session.schema.meta.pageNumberDigits ? { pageNumberDigits: session.schema.meta.pageNumberDigits } : {}),
  };
  clearSelection(session);
  replaceSchema(session, fresh, { resetHistory: true });
}

export function openReportText(session: BuilderSession, text: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    session.dispatchEvent(new CustomEvent('save-error', { detail: { error: 'invalid JSON' } }));
    return;
  }
  const validated = validateReport(parsed);
  if (!validated.ok) {
    session.dispatchEvent(new CustomEvent('save-error', { detail: { error: validated.error } }));
    return;
  }
  clearSelection(session);
  replaceSchema(session, validated.value, { resetHistory: true });
}

export function saveAsCopy(session: BuilderSession): void {
  const next: ReportSchemaV1 = {
    ...session.schema,
    id: newId('report'),
    meta: { ...session.schema.meta, name: `${session.schema.meta.name} (2)` },
  };
  replaceSchema(session, next);
  void saveReport(session);
}

export function exportJson(session: BuilderSession): void {
  const json = JSON.stringify(session.schema, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  session.dispatchEvent(new CustomEvent('export-json', { detail: { blob, filename: `${session.schema.id}.json` } }));
}
