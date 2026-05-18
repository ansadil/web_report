import type { Row } from '@reports-web/shared';
import { applyPattern } from '@reports-web/shared';
import { tryEvaluate } from './expression.js';
import { logger } from '../logging/logger.js';

export interface PayloadSource {
  readonly value?: string;
  readonly field?: string;
  readonly expression?: string;
  readonly format?: string;
}

export function resolveCodePayload(
  src: PayloadSource,
  ctx: { row?: Row; aggregates?: Record<string, unknown>; vars?: Record<string, unknown>; locale: 'ar' | 'en' },
): string {
  if (src.expression?.trim()) {
    const r = tryEvaluate(src.expression, ctx);
    if (!r.ok) {
      logger.warn('code-payload', 'expression failed', { expr: src.expression, error: r.error });
      return '';
    }
    return applyPattern(r.value, src.format, ctx.locale);
  }
  if (src.field?.trim()) {
    const v = ctx.row?.[src.field];
    return applyPattern(v, src.format, ctx.locale);
  }
  return src.value ?? '';
}
