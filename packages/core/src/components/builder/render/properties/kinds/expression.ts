import { html } from 'lit';
import type { ReportElement } from '../../../api.js';

type ExprEl = Extract<ReportElement, { kind: 'expr' }>;
type Patch = Partial<ReportElement>;

export function renderExpressionKind(el: ExprEl, update: (patch: Patch) => void) {
  return html`
    <label>expression<input data-testid="prop-expression" .value=${el.expression} placeholder="now()" @input=${(e: Event) => update({ expression: (e.target as HTMLInputElement).value } as Patch)} /></label>
    <label>format<input data-testid="prop-format" .value=${el.format ?? ''} placeholder="datetime" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
  `;
}
