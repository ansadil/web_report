import type { FieldMeta, Row } from '@reports-web/shared';

export interface DataQuery {
  readonly source: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface DataAdapter {
  readonly id: string;
  fetch(q: DataQuery, signal?: AbortSignal): Promise<readonly Row[]>;
  introspect?(q: DataQuery, signal?: AbortSignal): Promise<readonly FieldMeta[]>;
}
