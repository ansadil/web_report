import { html } from 'lit';
import type { FieldMeta } from '@reports-web/shared';
import type { ReportElement } from '../../../api.js';

type FieldEl = Extract<ReportElement, { kind: 'field' }>;
type Patch = Partial<ReportElement>;

export function renderFieldKind(el: FieldEl, fields: readonly FieldMeta[], update: (patch: Patch) => void) {
  return html`
    <label>field
      <select data-testid="prop-field" @change=${(e: Event) => update({ field: (e.target as HTMLSelectElement).value } as Patch)}>
        ${fields.map((f) => html`<option value=${f.name} ?selected=${el.field === f.name}>${f.name}</option>`)}
      </select>
    </label>
    <label>format<input data-testid="prop-format" .value=${el.format ?? ''} placeholder="decimal2, date, currency:USD" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
  `;
}
