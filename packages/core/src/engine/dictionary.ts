import type { DataDictionary, DictField, DictSource, LocalizedText, ParameterDef, SystemVar } from '@reports-web/shared';
import type { DataAdapter } from '../adapters/data/types.js';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { logger } from '../logging/logger.js';

/** System variables provided by core (never by adapters). */
export const SYSTEM_VARIABLES: readonly SystemVar[] = Object.freeze([
  { token: '{page}', label: { ar: 'رقم الصفحة', en: 'Page number' }, type: 'number' },
  { token: '{pages}', label: { ar: 'عدد الصفحات', en: 'Total pages' }, type: 'number' },
  { token: '{date}', label: { ar: 'التاريخ', en: 'Date' }, type: 'date' },
  { token: '{reportName}', label: { ar: 'اسم التقرير', en: 'Report name' }, type: 'string' },
] satisfies SystemVar[]);

/**
 * Resolves a `LocalizedText` to a display string for `locale`.
 * Order: exact locale -> `en` -> first available value -> `fallback`.
 */
export function resolveLabel(label: LocalizedText | undefined | null, locale: string, fallback = ''): string {
  if (label == null) return fallback;
  if (typeof label === 'string') return label;
  const exact = label[locale];
  if (exact) return exact;
  const en = label['en'];
  if (en) return en;
  for (const v of Object.values(label)) if (v) return v;
  return fallback;
}

/** Binding path of a field: `path` when set, otherwise `name` (backward compatible). */
export function fieldPath(field: Pick<DictField, 'name' | 'path'>): string {
  return field.path ?? field.name;
}

export interface BuildDataDictionaryOptions {
  readonly schema: Pick<ReportSchemaV1, 'dataset' | 'fields'> & Partial<Pick<ReportSchemaV1, 'parameters'>>;
  readonly adapter?: DataAdapter;
  readonly signal?: AbortSignal;
}

function isAbort(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (e instanceof Error && e.name === 'AbortError');
}

/** Adapter parameters first; template (schema) parameters override by `name`. */
function mergeParameters(
  fromAdapter: readonly ParameterDef[] | undefined,
  fromSchema: readonly ParameterDef[] | undefined,
): readonly ParameterDef[] | undefined {
  if (!fromAdapter?.length && !fromSchema?.length) return undefined;
  const byName = new Map<string, ParameterDef>();
  for (const p of fromAdapter ?? []) byName.set(p.name, p);
  for (const p of fromSchema ?? []) byName.set(p.name, p);
  return [...byName.values()];
}

async function fallbackSources(opts: BuildDataDictionaryOptions): Promise<DictSource[]> {
  const { schema, adapter, signal } = opts;
  const fields: DictField[] = schema.fields.map((f) => ({
    name: f.name,
    type: f.type,
    ...(f.label !== undefined ? { label: f.label } : {}),
  }));
  if (adapter?.introspect) {
    try {
      const introspected = await adapter.introspect(
        { source: schema.dataset.source, ...(schema.dataset.params ? { params: schema.dataset.params } : {}) },
        signal,
      );
      const known = new Set(fields.map(fieldPath));
      for (const f of introspected) {
        if (!known.has(fieldPath(f))) {
          fields.push(f);
          known.add(fieldPath(f));
        }
      }
    } catch (e) {
      if (isAbort(e, signal)) throw e;
      logger.warn('dictionary', 'introspect failed; using schema fields only', {
        source: schema.dataset.source,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return [{ name: schema.dataset.source, fields }];
}

/**
 * Builds the data dictionary shown in the designer's dictionary panel.
 * - Uses `adapter.describe()` when available.
 * - Otherwise (or if `describe()` fails) falls back to the schema `fields`, enriched with `adapter.introspect()`.
 * - Always adds core `systemVariables` and the template's `parameters`.
 * Pure: no DOM, does not mutate inputs.
 */
export async function buildDataDictionary(opts: BuildDataDictionaryOptions): Promise<DataDictionary> {
  const { schema, adapter, signal } = opts;
  signal?.throwIfAborted();

  let described: Awaited<ReturnType<NonNullable<DataAdapter['describe']>>> | undefined;
  if (adapter?.describe) {
    try {
      described = await adapter.describe();
    } catch (e) {
      if (isAbort(e, signal)) throw e;
      logger.warn('dictionary', 'describe failed; falling back to schema fields', {
        adapter: adapter.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    signal?.throwIfAborted();
  }

  const sources = described ? described.sources : await fallbackSources(opts);
  signal?.throwIfAborted();
  const parameters = mergeParameters(described?.parameters, schema.parameters);

  return {
    sources,
    ...(described?.relations ? { relations: described.relations } : {}),
    ...(parameters ? { parameters } : {}),
    systemVariables: SYSTEM_VARIABLES,
  };
}
