import type { ReportSchemaV1 } from '../../schema/report-schema.js';

export interface ReportSummary {
  readonly id: string;
  readonly name: string;
  readonly updatedAt?: string;
}

export interface StorageAdapter {
  readonly id: string;
  load(id: string): Promise<ReportSchemaV1>;
  save(id: string, schema: ReportSchemaV1): Promise<void>;
  list?(): Promise<readonly ReportSummary[]>;
  delete?(id: string): Promise<void>;
}
