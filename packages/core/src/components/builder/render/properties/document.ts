import type { LocaleTag } from '@reports-web/shared';
import { html, nothing, type TemplateResult } from 'lit';
import { icon, t } from '../../api.js';
import { formatLocalizedNumber, parseLocalizedNumber } from '../../status-bar.js';
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

export function renderInspectorChrome(locale: DocumentState['locale'], onFilter: (event: Event) => void) {
  return html`
    <div class="prop-tools">
      <button type="button" title=${t(locale, 'sortAlpha')} @click=${(e: Event) => layoutProps(e, 'alpha')}>A–Z</button>
      <button type="button" class="on" title=${t(locale, 'categorize')} @click=${(e: Event) => layoutProps(e, 'category')}>${t(locale, 'categorize')}</button>
    </div>
    <div class="prop-search"><input placeholder=${t(locale, 'searchProperties')} @input=${onFilter} /></div>
  `;
}

function layoutProps(event: Event, mode: 'alpha' | 'category'): void {
  const button = event.currentTarget as HTMLButtonElement;
  const grid = button.closest('.prop-grid');
  if (!grid) return;
  grid.querySelectorAll('.prop-tools button').forEach((node) => node.classList.toggle('on', node === button));
  grid.querySelectorAll('.cat').forEach((cat) => {
    const body = cat.querySelector(':scope > .cat-b') ?? cat;
    const rows = [...body.querySelectorAll(':scope > .prow')] as HTMLElement[];
    rows.forEach((row, index) => {
      if (!row.dataset.order) row.dataset.order = String(index);
    });
    const sorted = [...rows].sort((a, b) => mode === 'alpha'
      ? (a.querySelector('.k')?.textContent ?? '').localeCompare(b.querySelector('.k')?.textContent ?? '', undefined, { sensitivity: 'base' })
      : Number(a.dataset.order) - Number(b.dataset.order));
    for (const row of sorted) body.append(row);
  });
}

export function renderCategory(title: string, count: number, body: TemplateResult | readonly unknown[], opts?: { closed?: boolean; testId?: string }) {
  return html`
    <section class="cat ${opts?.closed ? 'closed' : ''}" data-testid=${opts?.testId ?? nothing}>
      <button type="button" class="cat-h" @click=${toggleCat}>
        ${icon('sectionDown')}<span>${title}</span><span class="cnt">${count}</span>
      </button>
      <div class="cat-b">${body}</div>
    </section>
  `;
}

function toggleCat(event: Event): void {
  (event.currentTarget as HTMLElement).closest('.cat')?.classList.toggle('closed');
}

export function renderDocumentProperties(state: DocumentState, cb: DocumentCallbacks) {
  const meta = state.schema.meta;
  const page = state.schema.page;
  const fmt = { locale: state.locale, digits: state.schema.meta.pageNumberDigits ?? ('locale' as const) };
  const cm = (mm: number) => formatLocalizedNumber(mm / 10, fmt, 2);
  const readCm = (raw: string) => {
    const n = parseLocalizedNumber(raw);
    return Number.isFinite(n) ? n * 10 : 0;
  };
  return html`
    <div class="prop-grid" data-testid="property-grid">
      <div class="prop-card">
        <span class="prop-card-icon">P</span>
        <div><b>${meta.name}</b><small>${t(state.locale, 'page')}</small></div>
      </div>
      <div class="ptoggle"><button type="button" class="on">${t(state.locale, 'properties')}</button><button type="button">${t(state.locale, 'events')}</button></div>
      ${renderInspectorChrome(state.locale, filterPropRows)}
      ${renderCategory(t(state.locale, 'page'), 6, html`
        <div class="prow"><span class="k" title=${t(state.locale, 'paperSize')}>${t(state.locale, 'paperSize')}</span><span class="v"><select data-testid="prop-paper-size" @change=${(e: Event) => cb.updatePage({ size: (e.target as HTMLSelectElement).value as 'A4' | 'A5' | 'Letter' })}>
          <option value="A4" ?selected=${page.size === 'A4'}>A4</option>
          <option value="A5" ?selected=${page.size === 'A5'}>A5</option>
          <option value="Letter" ?selected=${page.size === 'Letter'}>Letter</option>
        </select></span></div>
        <div class="prow"><span class="k" title=${t(state.locale, 'orientation')}>${t(state.locale, 'orientation')}</span><span class="v"><select data-testid="prop-page-orientation" @change=${(e: Event) => cb.updatePage({ orientation: (e.target as HTMLSelectElement).value as 'portrait' | 'landscape' })}>
          <option value="portrait" ?selected=${page.orientation === 'portrait'}>${t(state.locale, 'portrait')}</option>
          <option value="landscape" ?selected=${page.orientation === 'landscape'}>${t(state.locale, 'landscape')}</option>
        </select></span></div>
        <div class="prow"><span class="k" title=${t(state.locale, 'top')}>${t(state.locale, 'top')}</span><span class="v"><input data-testid="prop-margin-top" .value=${cm(page.margins.top)} @input=${(e: Event) => cb.updateMargins({ top: readCm((e.target as HTMLInputElement).value) })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
        <div class="prow"><span class="k" title=${t(state.locale, 'right')}>${t(state.locale, 'right')}</span><span class="v"><input data-testid="prop-margin-right" .value=${cm(page.margins.right)} @input=${(e: Event) => cb.updateMargins({ right: readCm((e.target as HTMLInputElement).value) })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
        <div class="prow"><span class="k" title=${t(state.locale, 'bottom')}>${t(state.locale, 'bottom')}</span><span class="v"><input data-testid="prop-margin-bottom" .value=${cm(page.margins.bottom)} @input=${(e: Event) => cb.updateMargins({ bottom: readCm((e.target as HTMLInputElement).value) })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
        <div class="prow"><span class="k" title=${t(state.locale, 'left')}>${t(state.locale, 'left')}</span><span class="v"><input data-testid="prop-margin-left" .value=${cm(page.margins.left)} @input=${(e: Event) => cb.updateMargins({ left: readCm((e.target as HTMLInputElement).value) })} /><span class="u">${t(state.locale, 'unitCm')}</span></span></div>
      `, { testId: 'cat-page' })}
      ${renderCategory(t(state.locale, 'document'), 3, html`
        <div class="prow"><span class="k" title=${t(state.locale, 'description')}>${t(state.locale, 'description')}</span><span class="v"><input data-testid="prop-description" .value=${meta.description ?? ''} @input=${(e: Event) => cb.updateMeta({ description: (e.target as HTMLInputElement).value || undefined })} /></span></div>
        <div class="prow"><span class="k" title=${t(state.locale, 'locale')}>${t(state.locale, 'locale')}</span><span class="v"><select data-testid="prop-locale" @change=${(e: Event) => cb.updateMeta({ locale: (e.target as HTMLSelectElement).value })}>
          <option value="en" ?selected=${meta.locale === 'en'}>${t(state.locale, 'localeEnglish')}</option>
          <option value="ar" ?selected=${meta.locale === 'ar'}>${t(state.locale, 'localeArabic')}</option>
          ${meta.locale !== 'en' && meta.locale !== 'ar' ? html`<option value=${meta.locale} selected>${meta.locale}</option>` : nothing}
        </select></span></div>
        <div class="prow"><span class="k" title=${t(state.locale, 'direction')}>${t(state.locale, 'direction')}</span><span class="v"><select data-testid="prop-direction" @change=${(e: Event) => cb.updateMeta({ dir: (e.target as HTMLSelectElement).value as 'rtl' | 'ltr' })}>
          <option value="ltr" ?selected=${meta.dir === 'ltr'}>${t(state.locale, 'dirLtr')}</option>
          <option value="rtl" ?selected=${meta.dir === 'rtl'}>${t(state.locale, 'dirRtl')}</option>
        </select></span></div>
      `)}
      ${renderCategory(t(state.locale, 'reportBands'), 3, html`
        ${renderReportBandsEditor(state, cb)}
        ${renderGroupsBandsEditor(state, cb)}
        ${renderWatermarkEditor({ locale: state.locale, watermark: state.schema.watermark }, cb)}
      `)}
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
