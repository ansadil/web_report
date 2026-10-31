import { html } from 'lit';
import type { FieldMeta, LocaleTag } from '@reports-web/shared';
import { t, type ReportElement } from '../../../api.js';

type ChartEl = Extract<ReportElement, { kind: 'chart' }>;
type Patch = Partial<ReportElement>;

export function renderChartKind(el: ChartEl, fields: readonly FieldMeta[], locale: LocaleTag, update: (patch: Patch) => void) {
  return html`
    <label>${t(locale, 'chartType')}
      <select data-testid="prop-chart-type" @change=${(e: Event) => update({ type: (e.target as HTMLSelectElement).value as 'bar' } as Patch)}>
        ${['bar', 'line', 'pie', 'doughnut'].map((c) => html`<option value=${c} ?selected=${el.type === c}>${c}</option>`)}
      </select>
    </label>
    <label>${t(locale, 'labelsField')}
      <select data-testid="prop-labels-field" @change=${(e: Event) => update({ labelsField: (e.target as HTMLSelectElement).value } as Patch)}>
        ${fields.map((f) => html`<option value=${f.name} ?selected=${el.labelsField === f.name}>${f.name}</option>`)}
      </select>
    </label>
    <label>${t(locale, 'valueField')}
      <select data-testid="prop-value-field" @change=${(e: Event) => update({ valueField: (e.target as HTMLSelectElement).value } as Patch)}>
        ${fields.map((f) => html`<option value=${f.name} ?selected=${el.valueField === f.name}>${f.name}</option>`)}
      </select>
    </label>
    <label>${t(locale, 'title')}<input data-testid="prop-title" .value=${el.title ?? ''} @input=${(e: Event) => update({ title: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
  `;
}
