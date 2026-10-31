import type { LocaleTag } from '@reports-web/shared';
import { html, nothing } from 'lit';
import { t } from '../../api.js';
import type { Band, Group, ReportSchemaV1 } from '../../api.js';
import { BAND_KEYS, type BandKey } from '../../types.js';

export interface BandsState {
  locale: LocaleTag;
  schema: ReportSchemaV1;
}

export interface BandsCallbacks {
  patchRootBand: (key: BandKey, patch: Partial<Band>) => void;
  enableRootBand: (key: Exclude<BandKey, 'detail'>) => void;
  disableRootBand: (key: Exclude<BandKey, 'detail'>) => void;
  patchGroupAt: (idx: number, patch: Partial<Group>) => void;
  patchGroupBandAt: (idx: number, slot: 'header' | 'footer', patch: Partial<Band>) => void;
  setGroupBandAt: (idx: number, slot: 'header' | 'footer', band: Band | undefined) => void;
}

export function renderReportBandsEditor(state: BandsState, cb: BandsCallbacks) {
  return html`
    <div class="group">
      <h4>${t(state.locale, 'reportBands')}</h4>
      ${BAND_KEYS.map((key) => renderRootBandBlock(state, cb, key))}
    </div>
  `;
}

export function renderGroupsBandsEditor(state: BandsState, cb: BandsCallbacks) {
  const groups = state.schema.groups;
  if (groups.length === 0) {
    return html`
      <div class="group">
        <h4>${t(state.locale, 'reportGroups')}</h4>
        <div class="empty-hint" style="padding:8px">${t(state.locale, 'none')}</div>
      </div>
    `;
  }
  return html`
    <div class="group">
      <h4>${t(state.locale, 'reportGroups')}</h4>
      ${groups.map((g, idx) => renderGroupBlock(state, cb, g, idx))}
    </div>
  `;
}

function renderRootBandBlock(state: BandsState, cb: BandsCallbacks, key: BandKey) {
  const band = state.schema.bands[key];
  const title = t(state.locale, key as 'reportHeader');
  if (key !== 'detail' && !band) {
    return html`
      <div class="sub-panel" data-root-band=${key}>
        <h5>${title}</h5>
        <button type="button" class="secondary" @click=${() => cb.enableRootBand(key)}>${t(state.locale, 'enable')}</button>
      </div>
    `;
  }
  const b = band as Band;
  return html`
    <div class="sub-panel" data-root-band=${key}>
      <h5>${title}</h5>
      <label>${t(state.locale, 'heightMm')}
        <input type="number" min="0" step="0.5" data-testid=${`prop-band-${key}-height`} .value=${String(b.height)}
               @input=${(e: Event) => cb.patchRootBand(key, { height: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label><input type="checkbox" data-testid=${`prop-band-${key}-break-before`} .checked=${!!b.pageBreakBefore}
             @change=${(e: Event) =>
               cb.patchRootBand(key, { pageBreakBefore: (e.target as HTMLInputElement).checked ? true : undefined })} />
        ${t(state.locale, 'pageBreakBefore')}</label>
      <label><input type="checkbox" data-testid=${`prop-band-${key}-break-after`} .checked=${!!b.pageBreakAfter}
             @change=${(e: Event) =>
               cb.patchRootBand(key, { pageBreakAfter: (e.target as HTMLInputElement).checked ? true : undefined })} />
        ${t(state.locale, 'pageBreakAfter')}</label>
      ${key !== 'detail'
        ? html`
            <div class="band-actions">
              <button type="button" class="danger" @click=${() => cb.disableRootBand(key)}>
                ${t(state.locale, 'removeSection')}
              </button>
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderGroupBlock(state: BandsState, cb: BandsCallbacks, g: Group, idx: number) {
  return html`
    <div class="sub-panel" data-group-index=${String(idx)}>
      <h5>${t(state.locale, 'reportGroups')} #${idx + 1}</h5>
      <label>${t(state.locale, 'groupByField')}
        <input data-testid=${`prop-group-${idx}-key`} .value=${g.key}
               @input=${(e: Event) => cb.patchGroupAt(idx, { key: (e.target as HTMLInputElement).value })} />
      </label>
      <label><input type="checkbox" data-testid=${`prop-group-${idx}-reset-page`} .checked=${!!g.resetPageNumber}
             @change=${(e: Event) =>
               cb.patchGroupAt(idx, { resetPageNumber: (e.target as HTMLInputElement).checked ? true : undefined })} />
        ${t(state.locale, 'resetPageNumber')}</label>
      ${renderNestedBandSection(state.locale, t(state.locale, 'groupHeader'), g.header, `group-${idx}-header`, {
        onPatch: (p) => cb.patchGroupBandAt(idx, 'header', p),
        onEnable: () => cb.setGroupBandAt(idx, 'header', { height: 8, elements: [] }),
        onRemove: () => cb.setGroupBandAt(idx, 'header', undefined),
      })}
      ${renderNestedBandSection(state.locale, t(state.locale, 'groupFooter'), g.footer, `group-${idx}-footer`, {
        onPatch: (p) => cb.patchGroupBandAt(idx, 'footer', p),
        onEnable: () => cb.setGroupBandAt(idx, 'footer', { height: 8, elements: [] }),
        onRemove: () => cb.setGroupBandAt(idx, 'footer', undefined),
      })}
    </div>
  `;
}

function renderNestedBandSection(
  locale: LocaleTag,
  title: string,
  band: Band | undefined,
  testKey: string,
  ops: { onPatch: (p: Partial<Band>) => void; onEnable: () => void; onRemove: () => void },
) {
  if (!band) {
    return html`
      <div class="nested-band">
        <h6>${title}</h6>
        <button type="button" class="secondary" @click=${ops.onEnable}>${t(locale, 'enable')}</button>
      </div>
    `;
  }
  return html`
    <div class="nested-band">
      <h6>${title}</h6>
      <label>${t(locale, 'heightMm')}
        <input type="number" min="0" step="0.5" data-testid=${`prop-${testKey}-height`} .value=${String(band.height)}
               @input=${(e: Event) => ops.onPatch({ height: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label><input type="checkbox" data-testid=${`prop-${testKey}-break-before`} .checked=${!!band.pageBreakBefore}
             @change=${(e: Event) => ops.onPatch({ pageBreakBefore: (e.target as HTMLInputElement).checked ? true : undefined })} />
        ${t(locale, 'pageBreakBefore')}</label>
      <label><input type="checkbox" data-testid=${`prop-${testKey}-break-after`} .checked=${!!band.pageBreakAfter}
             @change=${(e: Event) => ops.onPatch({ pageBreakAfter: (e.target as HTMLInputElement).checked ? true : undefined })} />
        ${t(locale, 'pageBreakAfter')}</label>
      <div class="band-actions">
        <button type="button" class="danger" @click=${ops.onRemove}>${t(locale, 'removeSection')}</button>
      </div>
    </div>
  `;
}
