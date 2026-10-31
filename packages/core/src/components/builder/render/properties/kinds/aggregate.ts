import { html } from 'lit';
import type { FieldMeta } from '@reports-web/shared';
import type { ReportElement } from '../../../api.js';

type AggEl = Extract<ReportElement, { kind: 'aggregate' }>;
type Patch = Partial<ReportElement>;

export function renderAggregateKind(el: AggEl, fields: readonly FieldMeta[], update: (patch: Patch) => void) {
  return html`
    <div class="group">
      <h4>${el.kind}</h4>
      <div class="grid2">
        <label>fn
          <select data-testid="prop-fn" @change=${(e: Event) => update({ fn: (e.target as HTMLSelectElement).value as 'sum' } as Patch)}>
            ${['sum', 'count', 'avg', 'min', 'max'].map((f) => html`<option value=${f} ?selected=${el.fn === f}>${f}</option>`)}
          </select>
        </label>
        <label>scope
          <select data-testid="prop-scope" @change=${(e: Event) => update({ scope: (e.target as HTMLSelectElement).value as 'report' } as Patch)}>
            ${['report', 'page', 'group'].map((s) => html`<option value=${s} ?selected=${el.scope === s}>${s}</option>`)}
          </select>
        </label>
      </div>
      <label>field
        <select data-testid="prop-field" @change=${(e: Event) => update({ field: (e.target as HTMLSelectElement).value } as Patch)}>
          ${fields.map((f) => html`<option value=${f.name} ?selected=${el.field === f.name}>${f.name}</option>`)}
        </select>
      </label>
      <label>groupKey<input data-testid="prop-group-key" .value=${el.groupKey ?? ''} placeholder="region (only for scope=group)" @input=${(e: Event) => update({ groupKey: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
      <label>format<input data-testid="prop-format" .value=${el.format ?? ''} placeholder="decimal2" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
    </div>
  `;
}
