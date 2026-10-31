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
  return html`
    <form class="props" @submit=${(e: Event) => e.preventDefault()}>
      <div class="group">
        <h4>${t(state.locale, 'document')}</h4>
        <label>${t(state.locale, 'description')}<input data-testid="prop-description" .value=${meta.description ?? ''} @input=${(e: Event) => cb.updateMeta({ description: (e.target as HTMLInputElement).value || undefined })} /></label>
        <div class="grid2">
          <label>${t(state.locale, 'locale')}
            <select data-testid="prop-locale" @change=${(e: Event) => cb.updateMeta({ locale: (e.target as HTMLSelectElement).value })}>
              <option value="en" ?selected=${meta.locale === 'en'}>en</option>
              <option value="ar" ?selected=${meta.locale === 'ar'}>ar</option>
              ${meta.locale !== 'en' && meta.locale !== 'ar'
                ? html`<option value=${meta.locale} selected>${meta.locale}</option>`
                : nothing}
            </select>
          </label>
          <label>${t(state.locale, 'direction')}
            <select data-testid="prop-direction" @change=${(e: Event) => cb.updateMeta({ dir: (e.target as HTMLSelectElement).value as 'rtl' | 'ltr' })}>
              <option value="ltr" ?selected=${meta.dir === 'ltr'}>ltr</option>
              <option value="rtl" ?selected=${meta.dir === 'rtl'}>rtl</option>
            </select>
          </label>
        </div>
      </div>

      <div class="group">
        <h4>${t(state.locale, 'page')}</h4>
        <div class="grid2">
          <label>${t(state.locale, 'paperSize')}
            <select data-testid="prop-paper-size" @change=${(e: Event) => cb.updatePage({ size: (e.target as HTMLSelectElement).value as 'A4' | 'A5' | 'Letter' })}>
              <option value="A4" ?selected=${page.size === 'A4'}>A4</option>
              <option value="A5" ?selected=${page.size === 'A5'}>A5</option>
              <option value="Letter" ?selected=${page.size === 'Letter'}>Letter</option>
            </select>
          </label>
          <label>${t(state.locale, 'orientation')}
            <select data-testid="prop-page-orientation" @change=${(e: Event) => cb.updatePage({ orientation: (e.target as HTMLSelectElement).value as 'portrait' | 'landscape' })}>
              <option value="portrait" ?selected=${page.orientation === 'portrait'}>${t(state.locale, 'portrait')}</option>
              <option value="landscape" ?selected=${page.orientation === 'landscape'}>${t(state.locale, 'landscape')}</option>
            </select>
          </label>
        </div>
        <div class="grid4">
          <label>${t(state.locale, 'top')}<input data-testid="prop-margin-top" type="number" min="0" .value=${String(page.margins.top)} @input=${(e: Event) => cb.updateMargins({ top: Number((e.target as HTMLInputElement).value) })} /></label>
          <label>${t(state.locale, 'right')}<input data-testid="prop-margin-right" type="number" min="0" .value=${String(page.margins.right)} @input=${(e: Event) => cb.updateMargins({ right: Number((e.target as HTMLInputElement).value) })} /></label>
          <label>${t(state.locale, 'bottom')}<input data-testid="prop-margin-bottom" type="number" min="0" .value=${String(page.margins.bottom)} @input=${(e: Event) => cb.updateMargins({ bottom: Number((e.target as HTMLInputElement).value) })} /></label>
          <label>${t(state.locale, 'left')}<input data-testid="prop-margin-left" type="number" min="0" .value=${String(page.margins.left)} @input=${(e: Event) => cb.updateMargins({ left: Number((e.target as HTMLInputElement).value) })} /></label>
        </div>
      </div>

      ${renderReportBandsEditor(state, cb)}
      ${renderGroupsBandsEditor(state, cb)}
      ${renderWatermarkEditor({ locale: state.locale, watermark: state.schema.watermark }, cb)}
    </form>
  `;
}
