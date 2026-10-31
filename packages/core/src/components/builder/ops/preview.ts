import { applyPattern, type Row } from '@reports-web/shared';
import { buildReportEvalVars, tryEvaluate } from '../api.js';
import type { ReportElement, ReportSchemaV1 } from '../api.js';

export function previewExprText(
  schema: ReportSchemaV1,
  sampleRows: readonly Row[] | null,
  el: Extract<ReportElement, { kind: 'expr' }>,
): string {
  const vars = buildReportEvalVars(schema, sampleRows ?? [], new Date());
  const r = tryEvaluate(el.expression, { vars });
  if (!r.ok) return `=${el.expression}`;
  return applyPattern(r.value, el.format, schema.meta.locale);
}
