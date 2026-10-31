import type { DataDictionary, FieldMeta, Row } from '@reports-web/shared';

export interface DataQuery {
  readonly source: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface DataAdapter {
  readonly id: string;
  fetch(q: DataQuery, signal?: AbortSignal): Promise<readonly Row[]>;
  introspect?(q: DataQuery, signal?: AbortSignal): Promise<readonly FieldMeta[]>;
  /**
   * Optional: describe the data available to report designers (sources, nested fields,
   * relations, parameters). `systemVariables` are supplied by core, not by adapters.
   * When absent, core falls back to the schema `fields` + `introspect`.
   */
  describe?(): Promise<DataDictionaryDescription>;
}

/** What an adapter's `describe()` returns: a data dictionary without core-provided system variables. */
export type DataDictionaryDescription = Omit<DataDictionary, 'systemVariables'>;
