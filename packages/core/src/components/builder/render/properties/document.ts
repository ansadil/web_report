import type { LocaleTag } from '@reports-web/shared';
import { html, nothing } from 'lit';
import { t } from '../../api.js';
import type { ReportSchemaV1 } from '../../api.js';
import { renderGroupsBandsEditor, renderReportBandsEditor, type BandsCallbacks } from './bands.js';
import { renderWatermarkEditor, type WatermarkCallbacks } from './watermark.js';

export interface DocumentState {
  locale: LocaleTag;
  schema: ReportSchemaV1;
}

export interface DocumentCallbacks extends BandsCallbacks, WatermarkCallbacks {
  updateMeta: (patch: Partial<ReportSchemaV1['meta']>) => void;
  updatePage: (patch: Partial<ReportSchemaV1['page']>) => void;
  updateMargins: (patch: Partial<ReportSchemaV1['page']['margins']>) => void;
}

export function renderDocumentProperties(state: DocumentState, cb: DocumentCallbacks) {
  const meta = state.schema.meta;
  const page = state.schema.page;
  const cm = (mm: number) => (mm / 10).toFixed(2);
  return html`
    <div class="prop-grid" data-testid="property-grid">
      <div class="prop-card">
        <span class="prop-card-icon">P</span>
        <div><b>${meta.name}</b><small>${t(state.locale, 'page')}</small></div>
      </div>
      <div class="ptoggle"><button type="button" class="on">${t(state.locale, 'properties')}</button><button type="button">${t(state.locale, 'events')}</button></div>
      <div class="prop-search"><input placeholder=${t(state.locale, 'properties')} @input=${filterPropRows} /></div>
      <section class="cat">
        <div class="cat-h">${t(state.locale, 'positionSize')}<span class="cnt">6</span></div>
        <div class="prow"><span class="k">${t(state.locale, 'paperSize')}</span><span class="v"><select data-testid="prop-paper-size" @change=${(e: Event) => cb.updatePage({ size: (e.target as HTMLSelectElement).value as 'A4' | 'A5' | 'Letter' })}>
          <option value="A4" ?selected=${page.size === 'A4'}>A4</option>
          <option value="A5" ?selected=${page.size === 'A5'}>A5</option>
          <option value="Letter" ?selected=${page.size === 'Letter'}>Letter</option>
        </select></span></div>
        <div class="prow"><span class="k">${t(state.locale, 'orientation')}</span><span class="v"><select data-testid="prop-page-orientation" @change=${(e: Event) => cb.updatePage({ orientation: (e.target as HTMLSelectElement).value as 'portrait' | 'landscape' })}>
          <option value="portrait" ?selected=${page.orientation === 'portrait'}>${t(state.locale, 'portrait')}</option>
          <option value="landscape" ?selected=${page.orientation === 'landscape'}>${t(state.locale, 'landscape')}</option>
        </select></span></div>
        <div class="prow"><span class="k">${t(state.locale, 'top')}</span><span class="v"><input data-testid="prop-margin-top" .value=${cm(page.margins.top)} @input=${(e: Event) => cb.updateMargins({ top: Number((e.target as HTMLInputElement).value) * 10 })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
        <div class="prow"><span class="k">${t(state.locale, 'right')}</span><span class="v"><input data-testid="prop-margin-right" .value=${cm(page.margins.right)} @input=${(e: Event) => cb.updateMargins({ right: Number((e.target as HTMLInputElement).value) * 10 })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
        <div class="prow"><span class="k">${t(state.locale, 'bottom')}</span><span class="v"><input data-testid="prop-margin-bottom" .value=${cm(page.margins.bottom)} @input=${(e: Event) => cb.updateMargins({ bottom: Number((e.target as HTMLInputElement).value) * 10 })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
        <div class="prow"><span class="k">${t(state.locale, 'left')}</span><span class="v"><input data-testid="prop-margin-left" .value=${cm(page.margins.left)} @input=${(e: Event) => cb.updateMargins({ left: Number((e.target as HTMLInputElement).value) * 10 })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
      </section>
      <section class="cat">
        <div class="cat-h">${t(state.locale, 'document')}<span class="cnt">3</span></div>
        <div class="prow"><span class="k">${t(state.locale, 'description')}</span><span class="v"><input data-testid="prop-description" .value=${meta.description ?? ''} @input=${(e: Event) => cb.updateMeta({ description: (e.target as HTMLInputElement).value || undefined })} /></span></div>
        <div class="prow"><span class="k">${t(state.locale, 'locale')}</span><span class="v"><select data-testid="prop-locale" @change=${(e: Event) => cb.updateMeta({ locale: (e.target as HTMLSelectElement).value })}>
          <option value="en" ?selected=${meta.locale === 'en'}>${t(state.locale, 'localeEnglish')}</option>
          <option value="ar" ?selected=${meta.locale === 'ar'}>${t(state.locale, 'localeArabic')}</option>
          ${meta.locale !== 'en' && meta.locale !== 'ar' ? html`<option value=${meta.locale} selected>${meta.locale}</option>` : nothing}
        </select></span></div>
        <div class="prow"><span class="k">${t(state.locale, 'direction')}</span><span class="v"><select data-testid="prop-direction" @change=${(e: Event) => cb.updateMeta({ dir: (e.target as HTMLSelectElement).value as 'rtl' | 'ltr' })}>
          <option value="ltr" ?selected=${meta.dir === 'ltr'}>${t(state.locale, 'dirLtr')}</option>
          <option value="rtl" ?selected=${meta.dir === 'rtl'}>${t(state.locale, 'dirRtl')}</option>
        </select></span></div>
      </section>
      <details class="cat"><summary class="cat-h">${t(state.locale, 'page')}</summary>

      ${renderReportBandsEditor(state, cb)}
      ${renderGroupsBandsEditor(state, cb)}
      ${renderWatermarkEditor({ locale: state.locale, watermark: state.schema.watermark }, cb)}
      </details>
    </div>
  `;
}

function filterPropRows(event: Event): void {
  const input = event.target as HTMLInputElement;
  const q = input.value.trim().toLowerCase();
  input.closest('.prop-grid')?.querySelectorAll('.prow').forEach((row) => {
    const name = row.querySelector('.k')?.textContent?.toLowerCase() ?? '';
    (row as HTMLElement).hidden = q.length > 0 && !name.includes(q);
  });
}
