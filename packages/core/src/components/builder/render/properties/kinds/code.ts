import { html } from 'lit';
import type { FieldMeta } from '@reports-web/shared';
import { t } from '../../../api.js';
import type { ReportElement } from '../../../api.js';

type CodeEl = Extract<ReportElement, { kind: 'qr' | 'barcode' }>;
type Patch = Partial<ReportElement>;

export function renderCodeKind(el: CodeEl, fields: readonly FieldMeta[], locale: 'ar' | 'en', update: (patch: Patch) => void) {
  const symbologies = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'ITF14'] as const;
  return html`
    <div class="group">
      <h4>${t(locale, el.kind)}</h4>
      <label>${t(locale, 'value')}<input data-testid="prop-value" .value=${el.value ?? ''} placeholder="static text" @input=${(e: Event) => update({ value: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
      <label>${t(locale, 'field')}
        <select data-testid="prop-field" @change=${(e: Event) => update({ field: (e.target as HTMLSelectElement).value || undefined } as Patch)}>
          <option value="">-</option>
          ${fields.map((f) => html`<option value=${f.name} ?selected=${el.field === f.name}>${f.name}</option>`)}
        </select>
      </label>
      <label>${t(locale, 'expression')}<input data-testid="prop-expression" .value=${el.expression ?? ''} placeholder="orderId" @input=${(e: Event) => update({ expression: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
      <label>format<input data-testid="prop-format" .value=${el.format ?? ''} placeholder="decimal2" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
      ${el.kind === 'qr'
        ? html`<label>${t(locale, 'errorCorrection')}
            <select data-testid="prop-error-correction" @change=${(e: Event) => update({ errorCorrectionLevel: (e.target as HTMLSelectElement).value as 'M' } as Patch)}>
              ${['L', 'M', 'Q', 'H'].map((lvl) => html`<option value=${lvl} ?selected=${el.errorCorrectionLevel === lvl}>${lvl}</option>`)}
            </select>
          </label>`
        : html`
            <label>${t(locale, 'symbology')}
              <select data-testid="prop-symbology" @change=${(e: Event) => update({ symbology: (e.target as HTMLSelectElement).value as 'CODE128' } as Patch)}>
                ${symbologies.map((s) => html`<option value=${s} ?selected=${el.symbology === s}>${s}</option>`)}
              </select>
            </label>
            <label><input data-testid="prop-display-value" type="checkbox" .checked=${el.displayValue !== false} @change=${(e: Event) => update({ displayValue: (e.target as HTMLInputElement).checked } as Patch)} /> ${t(locale, 'displayValue')}</label>
          `}
    </div>
  `;
}
