/**
 * Public surface the builder is allowed to use.
 * Re-exports only names that `src/index.ts` already exposes, so these modules
 * can move to `@reports-web/builder` later without deep imports.
 */
export {
  buildReportEvalVars,
  createStaticAdapter,
  icon,
  installDirOverride,
  linePosForOrientationChange,
  lineThicknessMm,
  logger,
  normalizeLinePos,
  resolveDir,
  resolveLabel,
  resolveLocale,
  t,
  toolIconForKind,
  tryEvaluate,
  validateReport,
} from '../../index.js';

export type {
  Band,
  ConditionalFormatRule,
  DataAdapter,
  Element as ReportElement,
  Group,
  ReportSchemaV1,
  StorageAdapter,
  Style,
  Watermark,
} from '../../index.js';
