import { html } from 'lit';
import { t } from '../../../api.js';
import type { ReportElement } from '../../../api.js';

type LineEl = Extract<ReportElement, { kind: 'line' }>;
type Patch = Partial<ReportElement>;

export function renderLineKind(el: LineEl, locale: 'ar' | 'en', update: (patch: Patch) => void) {
  return html`
    <div class="group">
      <h4>${el.kind}</h4>
      <div class="grid2">
        <label>${t(locale, 'orientation')}
          <select data-testid="prop-line-orientation" @change=${(e: Event) => update({ orientation: (e.target as HTMLSelectElement).value as 'horizontal' } as Patch)}>
            <option value="horizontal" ?selected=${el.orientation === 'horizontal'}>horizontal</option>
            <option value="vertical" ?selected=${el.orientation === 'vertical'}>vertical</option>
          </select>
        </label>
        <label>${t(locale, 'thickness')}<input data-testid="prop-thickness" type="number" min="0.25" max="10" step="0.25" .value=${String(el.thickness)} @input=${(e: Event) => update({ thickness: Number((e.target as HTMLInputElement).value) } as Patch)} /></label>
      </div>
      <label>${t(locale, 'color')}<input data-testid="prop-line-color" type="color" .value=${el.color ?? '#000000'} @input=${(e: Event) => update({ color: (e.target as HTMLInputElement).value } as Patch)} /></label>
    </div>
  `;
}
