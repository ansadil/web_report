import { html } from 'lit';
import type { ReportElement } from '../../../api.js';

type TextEl = Extract<ReportElement, { kind: 'text' }>;
type Patch = Partial<ReportElement>;

export function renderTextKind(el: TextEl, update: (patch: Patch) => void) {
  return html`<label>value<input data-testid="prop-value" .value=${el.value} @input=${(e: Event) => update({ value: (e.target as HTMLInputElement).value } as Patch)} /></label>`;
}
