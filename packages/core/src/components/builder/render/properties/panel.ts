import { html } from 'lit';
import type { FieldMeta, LocaleTag } from '@reports-web/shared';
import { lineThicknessMm, t } from '../../api.js';
import type { ConditionalFormatRule, ReportElement, Style } from '../../api.js';
import { elementStatusName } from '../../status-bar.js';
import type { BandKey } from '../../types.js';
import { renderDocumentProperties, type DocumentCallbacks, type DocumentState } from './document.js';
import { renderKindSpecific } from './kinds/index.js';

export interface PropertiesState extends DocumentState {
  fields: readonly FieldMeta[];
  selectedBand: BandKey | null;
  selectedIds: ReadonlySet<string>;
}

function kindHeading(el: ReportElement, locale: LocaleTag): string {
  const key =
    el.kind === 'expr' ? 'expression' : el.kind === 'richtext' ? (el.mode === 'markdown' ? 'markdown' : 'html') : el.kind;
  const kind = t(locale, key);
  const name = elementStatusName(el, locale);
  return name === kind ? kind : `${kind} — ${name}`;
}

function colorInputValue(value: string | undefined): string {
  const raw = (value ?? '#111111').trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw);
  if (short?.[1]) {
    const [r, g, b] = short[1];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '#111111';
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
      <div class="props">
        <div class="group">
          <h4>${String(n)}</h4>
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.45">${t(state.locale, 'multiSelectionHint')}</p>
        </div>
        <button class="danger" type="button" @click=${cb.deleteSelected}>${t(state.locale, 'delete')}</button>
      </div>
    `;
  }

  const onlyId = [...state.selectedIds][0]!;
  const el = band?.elements.find((e) => e.id === onlyId);
  if (!el) return html`<div class="empty-hint">${t(state.locale, 'elementMissing')}</div>`;
  const selectedBand = state.selectedBand;
  const update = (patch: Partial<ReportElement>) => cb.updateElement(selectedBand, el.id, patch);
  const updateStyle = (patch: Partial<Style>) => update({ style: { ...(el.style ?? {}), ...patch } });
  const border = el.style?.border ?? {};

  const cm = (mm: number) => (mm / 10).toFixed(2);
  const setCm = (axis: 'x' | 'y' | 'w' | 'h', raw: string) => update({ pos: { ...el.pos, [axis]: Number(raw) * 10 } });
  return html`
    <div class="prop-grid" data-testid="property-grid">
      <div class="prop-card">
        <span class="prop-card-icon">${t(state.locale, 'text').slice(0, 1)}</span>
        <div>
          <b>${elementStatusName(el, state.locale)}</b>
          <small>${kindHeading(el, state.locale)}</small>
        </div>
      </div>
      <div class="ptoggle">
        <button type="button" class="on" @click=${(e: Event) => toggleInspector(e, false)}>${t(state.locale, 'properties')}</button>
        <button type="button" @click=${(e: Event) => toggleInspector(e, true)}>${t(state.locale, 'events')}</button>
      </div>
      <div class="prop-search"><input placeholder=${t(state.locale, 'properties')} @input=${filterRows} /></div>
      <div class="props-body">
      <section class="cat">
        <div class="cat-h">${t(state.locale, 'positionSize')}<span class="cnt">4</span></div>
        ${gridRow('x', html`<input data-testid="prop-x" .value=${cm(el.pos.x)} @input=${(e: Event) => setCm('x', (e.target as HTMLInputElement).value)} />`, t(state.locale, 'unitCm'))}
        ${gridRow('y', html`<input data-testid="prop-y" .value=${cm(el.pos.y)} @input=${(e: Event) => setCm('y', (e.target as HTMLInputElement).value)} />`, t(state.locale, 'unitCm'))}
        ${gridRow('w', html`<input data-testid="prop-width" .value=${cm(el.pos.w)} @input=${(e: Event) => setCm('w', (e.target as HTMLInputElement).value)} />`, t(state.locale, 'unitCm'))}
        ${gridRow('h', html`<input data-testid="prop-height" .value=${el.kind === 'line' ? String(lineThicknessMm(el.kind === 'line' ? el.thickness ?? 1 : 1)) : cm(el.pos.h)} ?disabled=${el.kind === 'line' && el.orientation === 'horizontal'} @input=${(e: Event) => setCm('h', (e.target as HTMLInputElement).value)} />`, t(state.locale, 'unitCm'))}
      </section>
      <section class="cat">
        <div class="cat-h">${t(state.locale, 'textAndFont')}<span class="cnt">6</span></div>
        ${gridRow(t(state.locale, 'fontFamily'), html`<input data-testid="prop-font-family" .value=${el.style?.font ?? ''} placeholder=${t(state.locale, 'inherit')} @input=${(e: Event) => updateStyle({ font: (e.target as HTMLInputElement).value || undefined })} />`)}
        ${gridRow(t(state.locale, 'fontSize'), html`<input data-testid="prop-font-size" .value=${String(el.style?.fontSize ?? 10)} @input=${(e: Event) => updateStyle({ fontSize: Number((e.target as HTMLInputElement).value) })} />`, t(state.locale, 'unitPt'))}
        ${gridRow(t(state.locale, 'align'), html`<select data-testid="prop-align" @change=${(e: Event) => updateStyle({ align: ((e.target as HTMLSelectElement).value || undefined) as Style['align'] })}>
          <option value="">-</option>
          <option value="start" ?selected=${el.style?.align === 'start'}>${t(state.locale, 'alignStart')}</option>
          <option value="center" ?selected=${el.style?.align === 'center'}>${t(state.locale, 'alignCenter')}</option>
          <option value="end" ?selected=${el.style?.align === 'end'}>${t(state.locale, 'alignEnd')}</option>
          <option value="justify" ?selected=${el.style?.align === 'justify'}>${t(state.locale, 'alignJustify')}</option>
        </select>`)}
        ${gridRow(t(state.locale, 'color'), html`<input data-testid="prop-color" type="color" .value=${colorInputValue(el.style?.color)} @input=${(e: Event) => updateStyle({ color: (e.target as HTMLInputElement).value })} />`)}
        ${gridRow(t(state.locale, 'bold'), html`<input data-testid="prop-bold" type="checkbox" .checked=${!!el.style?.bold} @change=${(e: Event) => updateStyle({ bold: (e.target as HTMLInputElement).checked })} />`)}
        ${gridRow(t(state.locale, 'padding'), html`<input data-testid="prop-padding" .value=${String(el.style?.padding ?? 0)} @input=${(e: Event) => updateStyle({ padding: Number((e.target as HTMLInputElement).value) || undefined })} />`)}
      </section>
      <details class="cat">
        <summary class="cat-h">${t(state.locale, 'style')}</summary>
        <label>${t(state.locale, 'visibleWhen')}<input data-testid="prop-visible-when" .value=${el.visibleWhen ?? ''} @input=${(e: Event) => update({ visibleWhen: (e.target as HTMLInputElement).value || undefined })} /></label>
        <label><input data-testid="prop-italic" type="checkbox" .checked=${!!el.style?.italic} @change=${(e: Event) => updateStyle({ italic: (e.target as HTMLInputElement).checked })} /> ${t(state.locale, 'italic')}</label>
        <label><input data-testid="prop-underline" type="checkbox" .checked=${!!el.style?.underline} @change=${(e: Event) => updateStyle({ underline: (e.target as HTMLInputElement).checked })} /> ${t(state.locale, 'underline')}</label>
        <label>${t(state.locale, 'background')}<input data-testid="prop-background" type="color" .value=${el.style?.background ?? '#ffffff'} @input=${(e: Event) => updateStyle({ background: (e.target as HTMLInputElement).value })} /></label>

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
      </details>
      </div>
      <div class="events-body">${t(state.locale, 'events')}</div>
    </div>
  `;
}

function gridRow(label: string, control: unknown, unit?: string) {
  return html`<div class="prow"><span class="k">${label}</span><span class="v">${control}${unit ? html`<span class="u">${unit}</span>` : ''}</span></div>`;
}

function filterRows(event: Event): void {
  const input = event.target as HTMLInputElement;
  const q = input.value.trim().toLowerCase();
  const grid = input.closest('.prop-grid');
  grid?.querySelectorAll('.prow').forEach((row) => {
    const name = row.querySelector('.k')?.textContent?.toLowerCase() ?? '';
    (row as HTMLElement).hidden = q.length > 0 && !name.includes(q);
  });
}

function toggleInspector(event: Event, events: boolean): void {
  const grid = (event.target as HTMLElement).closest('.prop-grid');
  grid?.classList.toggle('show-events', events);
  grid?.querySelectorAll('.ptoggle button').forEach((button, index) => button.classList.toggle('on', events ? index === 1 : index === 0));
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
        <label style="flex:1">${t(state.locale, 'color')}<input data-testid=${`prop-cond-${idx}-color`} type="color" .value=${colorInputValue(rule.style.color)} @input=${(e: Event) => updateRule({ style: { color: (e.target as HTMLInputElement).value } })} /></label>
        <label style="flex:1">${t(state.locale, 'background')}<input data-testid=${`prop-cond-${idx}-background`} type="color" .value=${rule.style.background ?? '#ffffff'} @input=${(e: Event) => updateRule({ style: { background: (e.target as HTMLInputElement).value } })} /></label>
      </div>
      <div class="row">
        <label><input data-testid=${`prop-cond-${idx}-bold`} type="checkbox" .checked=${!!rule.style.bold} @change=${(e: Event) => updateRule({ style: { bold: (e.target as HTMLInputElement).checked } })} /> ${t(state.locale, 'bold')}</label>
        <label><input data-testid=${`prop-cond-${idx}-italic`} type="checkbox" .checked=${!!rule.style.italic} @change=${(e: Event) => updateRule({ style: { italic: (e.target as HTMLInputElement).checked } })} /> ${t(state.locale, 'italic')}</label>
      </div>
    </div>
  `;
}
