import { nothing } from 'lit';
import type { FieldMeta, LocaleTag } from '@reports-web/shared';
import type { ReportElement } from '../../../api.js';
import { renderAggregateKind } from './aggregate.js';
import { renderChartKind } from './chart.js';
import { renderCodeKind } from './code.js';
import { renderExpressionKind } from './expression.js';
import { renderFieldKind } from './field.js';
import { renderImageKind } from './image.js';
import { renderLineKind } from './line.js';
import { renderRichTextKind } from './richtext.js';
import { renderTextKind } from './text.js';

export interface KindEditorState {
  el: ReportElement;
  fields: readonly FieldMeta[];
  locale: LocaleTag;
}

export interface KindEditorCallbacks {
  update: (patch: Partial<ReportElement>) => void;
}

export function renderKindSpecific(state: KindEditorState, cb: KindEditorCallbacks) {
  const { el, fields, locale } = state;
  const update = cb.update;
  if (el.kind === 'text') return renderTextKind(el, update);
  if (el.kind === 'field') return renderFieldKind(el, fields, update);
  if (el.kind === 'aggregate') return renderAggregateKind(el, fields, update);
  if (el.kind === 'chart') return renderChartKind(el, fields, update);
  if (el.kind === 'expr') return renderExpressionKind(el, update);
  if (el.kind === 'image') return renderImageKind(el, locale, update);
  if (el.kind === 'richtext') return renderRichTextKind(el, fields, locale, update);
  if (el.kind === 'qr' || el.kind === 'barcode') return renderCodeKind(el, fields, locale, update);
  if (el.kind === 'line') return renderLineKind(el, locale, update);
  return nothing;
}
