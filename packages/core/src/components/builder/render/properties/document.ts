import type { LocaleTag } from '@reports-web/shared';
import { html, nothing, type TemplateResult } from 'lit';
import { icon, t } from '../../api.js';
import { formatLocalizedNumber } from '../../status-bar.js';
import type { ReportSchemaV1 } from '../../api.js';
import { renderGroupsBandsEditor, renderReportBandsEditor, type BandsCallbacks } from './bands.js';
import { renderWatermarkEditor, type WatermarkCallbacks } from './watermark.js';

export interface DocumentState {
  locale: LocaleTag;
  schema: ReportSchemaV1;
  marginFeedback?: Partial<Record<'top' | 'right' | 'bottom' | 'left', { raw: string; error: string }>>;
}

export interface DocumentCallbacks extends BandsCallbacks, WatermarkCallbacks {
  updateMeta: (patch: Partial<ReportSchemaV1['meta']>) => void;
  updatePage: (patch: Partial<ReportSchemaV1['page']>) => void;
  onMarginInput: (side: 'top' | 'right' | 'bottom' | 'left', raw: string) => void;
}

export function renderInspectorChrome(locale: DocumentState['locale'], onFilter: (event: Event) => void) {
  return html`
    <div class="prop-tools">
      <button type="button" title=${t(locale, 'sortAlpha')} @click=${(e: Event) => layoutProps(e, 'alpha')}>A–Z</button>
      <button type="button" class="on" title=${t(locale, 'categorize')} @click=${(e: Event) => layoutProps(e, 'category')}>${t(locale, 'categorize')}</button>
    </div>
    <div class="prop-search"><input placeholder=${t(locale, 'searchProperties')} @input=${onFilter} /><svg class="search-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg></div>
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
  const marginRow = (side: 'top' | 'right' | 'bottom' | 'left', label: string) => {
    const feedback = state.marginFeedback?.[side];
    const error = feedback?.error ?? '';
    const errorId = `prop-margin-${side}-error`;
    return html`
      <div class="prow margin-row">
        <span class="k" title=${label}>${label}</span>
        <span class="v margin-v">
          <input
            data-testid=${`prop-margin-${side}`}
            .value=${feedback ? feedback.raw : cm(page.margins[side])}
            aria-invalid=${error ? 'true' : 'false'}
            aria-describedby=${error ? errorId : nothing}
            @input=${(e: Event) => cb.onMarginInput(side, (e.target as HTMLInputElement).value)}
          />
          <span class="u">${t(state.locale, 'unitCm')}</span>
          ${error ? html`<p class="margin-error" id=${errorId} role="alert">${error}</p>` : nothing}
        </span>
      </div>
    `;
  };
  return html`
    <div class="prop-grid" data-testid="property-grid">
      <div class="prop-card">
        <span class="prop-card-icon">P</span>
        <div><b>${meta.name}</b><small>${t(state.locale, 'page')}</small></div>
      </div>
      <div class="ptoggle"><button type="button" class="on">${t(state.locale, 'properties')}</button><button type="button">${t(state.locale, 'events')}</button></div>
      ${renderInspectorChrome(state.locale, filterPropRows)}
      ${renderCategory(t(state.locale, 'page'), 6, [
        html`<div class="prow"><span class="k" title=${t(state.locale, 'paperSize')}>${t(state.locale, 'paperSize')}</span><span class="v"><select data-testid="prop-paper-size" @change=${(e: Event) => cb.updatePage({ size: (e.target as HTMLSelectElement).value as 'A4' | 'A5' | 'Letter' })}>
          <option value="A4" ?selected=${page.size === 'A4'}>A4</option>
          <option value="A5" ?selected=${page.size === 'A5'}>A5</option>
          <option value="Letter" ?selected=${page.size === 'Letter'}>Letter</option>
        </select></span></div>`,
        html`<div class="prow"><span class="k" title=${t(state.locale, 'orientation')}>${t(state.locale, 'orientation')}</span><span class="v"><select data-testid="prop-page-orientation" @change=${(e: Event) => cb.updatePage({ orientation: (e.target as HTMLSelectElement).value as 'portrait' | 'landscape' })}>
          <option value="portrait" ?selected=${page.orientation === 'portrait'}>${t(state.locale, 'portrait')}</option>
          <option value="landscape" ?selected=${page.orientation === 'landscape'}>${t(state.locale, 'landscape')}</option>
        </select></span></div>`,
        marginRow('top', t(state.locale, 'top')),
        marginRow('right', t(state.locale, 'right')),
        marginRow('bottom', t(state.locale, 'bottom')),
        marginRow('left', t(state.locale, 'left')),
      ], { testId: 'cat-page' })}
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
      ${renderCategory(t(state.locale, 'reportBands'), 3, [
        renderReportBandsEditor(state, cb),
        renderGroupsBandsEditor(state, cb),
        renderWatermarkEditor({ locale: state.locale, watermark: state.schema.watermark }, cb),
      ])}
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
