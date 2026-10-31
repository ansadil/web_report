/**
 * Library surface used by the builder.
 * Re-exported from the specific source modules, never from the package root,
 * so importing the builder does not load the viewer or the exporters.
 */
export { createStaticAdapter } from '../../adapters/data/static.js';
export type { DataAdapter } from '../../adapters/data/types.js';
export type { StorageAdapter } from '../../adapters/storage/types.js';
export { icon, toolIconForKind } from '../icons.js';
export { installDirOverride, resolveDir, resolveLocale } from '../direction.js';
export { resolveLabel } from '../../engine/dictionary.js';
export { tryEvaluate } from '../../engine/expression.js';
export { buildReportEvalVars } from '../../engine/interpreter.js';
export { linePosForOrientationChange, lineThicknessMm, normalizeLinePos } from '../../engine/line-layout.js';
export { t } from '../../i18n/strings.js';
export { logger } from '../../logging/logger.js';
export { validateReport } from '../../schema/report-schema.js';
export type {
  Band,
  ConditionalFormatRule,
  Element as ReportElement,
  Group,
  ReportSchemaV1,
  Style,
  Watermark,
} from '../../schema/report-schema.js';
