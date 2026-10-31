import { html } from 'lit';
import type { FieldMeta } from '@reports-web/shared';
import { lineThicknessMm, t } from '../../api.js';
import type { ConditionalFormatRule, ReportElement, Style } from '../../api.js';
import type { BandKey } from '../../types.js';
import { renderDocumentProperties, type DocumentCallbacks, type DocumentState } from './document.js';
import { renderKindSpecific } from './kinds/index.js';

export interface PropertiesState extends DocumentState {
  fields: readonly FieldMeta[];
  selectedBand: BandKey | null;
  selectedIds: ReadonlySet<string>;
}

export interface PropertiesCallbacks extends DocumentCallbacks {
  updateElement: (band: BandKey, id: string, patch: Partial<ReportElement>) => void;
  deleteSelected: () => void;
  addCondRule: (el: ReportElement) => void;
}

export function renderProperties(state: PropertiesState, cb: PropertiesCallbacks) {
  if (!state.selectedBand || state.selectedIds.size === 0) return renderDocumentProperties(state, cb);
  const band = state.schema.bands[state.selectedBand];

  if (state.selectedIds.size > 1) {
    const n = state.selectedIds.size;
    return html`
      <form class="props" @submit=${(e: Event) => e.preventDefault()}>
        <div class="group">
          <h4>${String(n)}</h4>
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.45">${t(state.locale, 'multiSelectionHint')}</p>
        </div>
        <button class="danger" type="button" @click=${cb.deleteSelected}>${t(state.locale, 'delete')}</button>
      </form>
    `;
  }

  const onlyId = [...state.selectedIds][0]!;
  const el = band?.elements.find((e) => e.id === onlyId);
  if (!el) return html`<div class="empty-hint">Element not found</div>`;
  const selectedBand = state.selectedBand;
  const update = (patch: Partial<ReportElement>) => cb.updateElement(selectedBand, el.id, patch);
  const updateStyle = (patch: Partial<Style>) => update({ style: { ...(el.style ?? {}), ...patch } });
  const border = el.style?.border ?? {};

  return html`
    <form class="props" @submit=${(e: Event) => e.preventDefault()}>
      <div class="group">
        <h4>${el.kind.toUpperCase()} — id: ${el.id}</h4>
        <div class="grid4">
          <label>x<input data-testid="prop-x" type="number" .value=${String(el.pos.x)} @input=${(e: Event) => update({ pos: { ...el.pos, x: Number((e.target as HTMLInputElement).value) } })} /></label>
          <label>y<input data-testid="prop-y" type="number" .value=${String(el.pos.y)} @input=${(e: Event) => update({ pos: { ...el.pos, y: Number((e.target as HTMLInputElement).value) } })} /></label>
          ${el.kind === 'line'
            ? el.orientation === 'horizontal'
              ? html`
                  <label>w (length)<input data-testid="prop-width" type="number" min="5" .value=${String(el.pos.w)} @input=${(e: Event) => update({ pos: { ...el.pos, w: Number((e.target as HTMLInputElement).value) } })} /></label>
                  <label>h (${t(state.locale, 'thickness')})<input data-testid="prop-height" type="number" readonly disabled .value=${String(lineThicknessMm(el.thickness ?? 1))} /></label>
                `
              : html`
                  <label>w (${t(state.locale, 'thickness')})<input data-testid="prop-width" type="number" readonly disabled .value=${String(lineThicknessMm(el.thickness ?? 1))} /></label>
                  <label>h (length)<input data-testid="prop-height" type="number" min="5" .value=${String(el.pos.h)} @input=${(e: Event) => update({ pos: { ...el.pos, h: Number((e.target as HTMLInputElement).value) } })} /></label>
                `
            : html`
                <label>w<input data-testid="prop-width" type="number" .value=${String(el.pos.w)} @input=${(e: Event) => update({ pos: { ...el.pos, w: Number((e.target as HTMLInputElement).value) } })} /></label>
                <label>h<input data-testid="prop-height" type="number" .value=${String(el.pos.h)} @input=${(e: Event) => update({ pos: { ...el.pos, h: Number((e.target as HTMLInputElement).value) } })} /></label>
              `}
        </div>
        <label>${t(state.locale, 'visibleWhen')}<input data-testid="prop-visible-when" .value=${el.visibleWhen ?? ''} placeholder="amount &gt; 0" @input=${(e: Event) => update({ visibleWhen: (e.target as HTMLInputElement).value || undefined })} /></label>
      </div>

      <div class="group">
        <h4>${t(state.locale, 'style')}</h4>
        <label>${t(state.locale, 'fontFamily')}<input data-testid="prop-font-family" .value=${el.style?.font ?? ''} placeholder="inherit" @input=${(e: Event) => updateStyle({ font: (e.target as HTMLInputElement).value || undefined })} /></label>
        <div class="grid2">
          <label>${t(state.locale, 'fontSize')}<input data-testid="prop-font-size" type="number" min="4" max="96" .value=${String(el.style?.fontSize ?? 10)} @input=${(e: Event) => updateStyle({ fontSize: Number((e.target as HTMLInputElement).value) })} /></label>
          <label>${t(state.locale, 'align')}
            <select data-testid="prop-align" @change=${(e: Event) => updateStyle({ align: ((e.target as HTMLSelectElement).value || undefined) as Style['align'] })}>
              <option value="">-</option>
              <option value="start" ?selected=${el.style?.align === 'start'}>start</option>
              <option value="center" ?selected=${el.style?.align === 'center'}>center</option>
              <option value="end" ?selected=${el.style?.align === 'end'}>end</option>
              <option value="justify" ?selected=${el.style?.align === 'justify'}>justify</option>
            </select>
          </label>
        </div>
        <div class="grid2">
          <label>${t(state.locale, 'color')}<input data-testid="prop-color" type="color" .value=${el.style?.color ?? '#111111'} @input=${(e: Event) => updateStyle({ color: (e.target as HTMLInputElement).value })} /></label>
          <label>${t(state.locale, 'background')}<input data-testid="prop-background" type="color" .value=${el.style?.background ?? '#ffffff'} @input=${(e: Event) => updateStyle({ background: (e.target as HTMLInputElement).value })} /></label>
        </div>
        <div class="grid4">
          <label><input data-testid="prop-bold" type="checkbox" .checked=${!!el.style?.bold} @change=${(e: Event) => updateStyle({ bold: (e.target as HTMLInputElement).checked })} /> ${t(state.locale, 'bold')}</label>
          <label><input data-testid="prop-italic" type="checkbox" .checked=${!!el.style?.italic} @change=${(e: Event) => updateStyle({ italic: (e.target as HTMLInputElement).checked })} /> ${t(state.locale, 'italic')}</label>
          <label><input data-testid="prop-underline" type="checkbox" .checked=${!!el.style?.underline} @change=${(e: Event) => updateStyle({ underline: (e.target as HTMLInputElement).checked })} /> ${t(state.locale, 'underline')}</label>
          <label>${t(state.locale, 'padding')}<input data-testid="prop-padding" type="number" min="0" max="40" .value=${String(el.style?.padding ?? 0)} @input=${(e: Event) => updateStyle({ padding: Number((e.target as HTMLInputElement).value) || undefined })} /></label>
        </div>
      </div>

      <div class="group">
        <h4>${t(state.locale, 'border')}</h4>
        <div class="grid4">
          <label>${t(state.locale, 'top')}<input data-testid="prop-border-top" type="number" min="0" .value=${String(border.top ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, top: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
          <label>${t(state.locale, 'right')}<input data-testid="prop-border-right" type="number" min="0" .value=${String(border.right ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, right: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
          <label>${t(state.locale, 'bottom')}<input data-testid="prop-border-bottom" type="number" min="0" .value=${String(border.bottom ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, bottom: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
          <label>${t(state.locale, 'left')}<input data-testid="prop-border-left" type="number" min="0" .value=${String(border.left ?? 0)} @input=${(e: Event) => updateStyle({ border: { ...border, left: Number((e.target as HTMLInputElement).value) || undefined } })} /></label>
        </div>
        <label>${t(state.locale, 'color')}<input data-testid="prop-border-color" type="color" .value=${border.color ?? '#000000'} @input=${(e: Event) => updateStyle({ border: { ...border, color: (e.target as HTMLInputElement).value } })} /></label>
      </div>

      <div class="group">
        <h4>${t(state.locale, 'conditional')}</h4>
        ${(el.cond ?? []).map((rule, idx) => renderCondRule(state, cb, rule, idx, el))}
        <button class="secondary" type="button" @click=${() => cb.addCondRule(el)}>+ ${t(state.locale, 'addRule')}</button>
      </div>

      ${renderKindSpecific({ el, fields: state.fields, locale: state.locale }, { update })}

      <button class="danger" type="button" @click=${cb.deleteSelected}>${t(state.locale, 'delete')}</button>
    </form>
  `;
}

function renderCondRule(
  state: PropertiesState,
  cb: PropertiesCallbacks,
  rule: ConditionalFormatRule,
  idx: number,
  el: ReportElement,
) {
  const updateRule = (patch: Partial<ConditionalFormatRule>) => {
    const next = [...(el.cond ?? [])];
    next[idx] = { ...rule, ...patch, style: { ...rule.style, ...(patch.style ?? {}) } };
    cb.updateElement(state.selectedBand!, el.id, { cond: next });
  };
  const removeRule = () => {
    const next = (el.cond ?? []).filter((_, i) => i !== idx);
    cb.updateElement(state.selectedBand!, el.id, { cond: next.length > 0 ? next : undefined });
  };
  return html`
    <div class="cond-rule">
      <div class="row">
        <input data-testid=${`prop-cond-${idx}-when`} placeholder=${t(state.locale, 'when')} .value=${rule.when} @input=${(e: Event) => updateRule({ when: (e.target as HTMLInputElement).value })} />
        <button class="danger" type="button" @click=${removeRule} title=${t(state.locale, 'delete')}>×</button>
      </div>
      <div class="row">
        <label style="flex:1">${t(state.locale, 'color')}<input data-testid=${`prop-cond-${idx}-color`} type="color" .value=${rule.style.color ?? '#111111'} @input=${(e: Event) => updateRule({ style: { color: (e.target as HTMLInputElement).value } })} /></label>
        <label style="flex:1">${t(state.locale, 'background')}<input data-testid=${`prop-cond-${idx}-background`} type="color" .value=${rule.style.background ?? '#ffffff'} @input=${(e: Event) => updateRule({ style: { background: (e.target as HTMLInputElement).value } })} /></label>
      </div>
      <div class="row">
        <label><input data-testid=${`prop-cond-${idx}-bold`} type="checkbox" .checked=${!!rule.style.bold} @change=${(e: Event) => updateRule({ style: { bold: (e.target as HTMLInputElement).checked } })} /> ${t(state.locale, 'bold')}</label>
        <label><input data-testid=${`prop-cond-${idx}-italic`} type="checkbox" .checked=${!!rule.style.italic} @change=${(e: Event) => updateRule({ style: { italic: (e.target as HTMLInputElement).checked } })} /> ${t(state.locale, 'italic')}</label>
      </div>
    </div>
  `;
}
