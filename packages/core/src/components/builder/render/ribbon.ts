import type { LocaleTag } from '@reports-web/shared';
import { html, nothing, type TemplateResult } from 'lit';
import { icon, t, toolIconForKind } from '../api.js';
import type { Style } from '../api.js';
import type { ArrangeMode } from '../ops/arrange.js';
import { ribbonTabFromKey } from '../ribbon-keys.js';
import { formatLocalizedNumber, parseLocalizedNumber } from '../status-bar.js';
import { TOOL_KINDS, type RibbonTab, type ToolKind } from '../types.js';
import type { ActionsCallbacks, ActionsState } from './toolbar.js';

const FONT_FAMILIES = ['Cairo', 'Tajawal', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Noto Sans'] as const;

export interface RibbonFontState {
  enabled: boolean;
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  align: Style['align'] | '';
}

export interface RibbonState {
  locale: LocaleTag;
  dir: 'ltr' | 'rtl';
  /** `latn` keeps Western digits. Otherwise digits follow the UI locale. */
  digits: 'locale' | 'latn';
  tab: RibbonTab;
  actions: ActionsState;
  canCut: boolean;
  canPaste: boolean;
  canBringToFront: boolean;
  canBringForward: boolean;
  canSendToBack: boolean;
  canSendBackward: boolean;
  selectionCount: number;
  font: RibbonFontState;
}

export interface RibbonCallbacks {
  onTab: (tab: RibbonTab) => void;
  actions: ActionsCallbacks;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendToBack: () => void;
  onSendBackward: () => void;
  onInsertDragStart: (ev: DragEvent, kind: ToolKind) => void;
  onPortrait: () => void;
  onLandscape: () => void;
  onNew: () => void;
  onOpenText: (text: string) => void;
  onSaveAs: () => void;
  onArrange: (mode: ArrangeMode) => void;
  onStyle: (patch: Partial<Style>) => void;
}

const TABS: { id: RibbonTab; label: 'ribbonFile' | 'ribbonHome' | 'ribbonInsert' | 'ribbonLayout' | 'ribbonPage' | 'ribbonView' | 'preview' }[] = [
  { id: 'file', label: 'ribbonFile' },
  { id: 'home', label: 'ribbonHome' },
  { id: 'insert', label: 'ribbonInsert' },
  { id: 'layout', label: 'ribbonLayout' },
  { id: 'page', label: 'ribbonPage' },
  { id: 'view', label: 'ribbonView' },
  { id: 'preview', label: 'preview' },
];

function colorInputValue(value: string): string {
  const raw = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw);
  if (short?.[1]) {
    const [r, g, b] = short[1];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '#111111';
}

export function renderRibbon(state: RibbonState, cb: RibbonCallbacks) {
  const font = state.font;
  const digits = { locale: state.locale, digits: state.digits };
  const fontSizeLabel = formatLocalizedNumber(font.size, digits);
  const canAlign = state.selectionCount >= 2;
  const canDistribute = state.selectionCount >= 3;
  return html`
    <div class="ribbon" data-testid="ribbon">
      <div class="ribbon-tabs" role="tablist" aria-orientation="horizontal" @keydown=${(ev: KeyboardEvent) => onTabsKey(ev, state, cb)}>
        ${TABS.map(
          (tab) => html`
            <button
              type="button"
              class="ribbon-tab ${tab.id === 'file' ? 'file' : ''} ${tab.id === 'preview' ? 'preview-tab' : ''} ${state.tab === tab.id ? 'active' : ''}"
              role="tab"
              id=${`ribbon-tab-${tab.id}`}
              aria-controls=${`ribbon-panel-${tab.id}`}
              data-testid=${`ribbon-tab-${tab.id}`}
              aria-selected=${state.tab === tab.id ? 'true' : 'false'}
              tabindex=${state.tab === tab.id ? '0' : '-1'}
              @click=${() => cb.onTab(tab.id)}
            >${t(state.locale, tab.label)}</button>
          `,
        )}
      </div>
      <div class="ribbon-body">
        <div class="ribbon-pane" role="tabpanel" id="ribbon-panel-file" aria-labelledby="ribbon-tab-file" tabindex=${state.tab === 'file' ? '0' : '-1'} ?hidden=${state.tab !== 'file'}>
          ${cluster(
            state.locale,
            'ribbonGroupFile',
            html`
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-new" @click=${cb.onNew}>${icon('plus')}<span>${t(state.locale, 'newReport')}</span></button>
              <label class="ribbon-cmd">
                ${icon('folderOpen')}<span>${t(state.locale, 'open')}</span>
                <input
                  class="ribbon-file"
                  type="file"
                  accept="application/json,.json"
                  data-testid="ribbon-open-file"
                  @change=${(ev: Event) => readOpenFile(ev, cb.onOpenText)}
                />
              </label>
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-file-save" @click=${cb.actions.onSave}>${icon('save')}<span>${t(state.locale, 'save')}</span></button>
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-save-as" @click=${cb.onSaveAs}>${icon('copy')}<span>${t(state.locale, 'saveAs')}</span></button>
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-file-export" @click=${cb.actions.onExportJson}>${icon('json')}<span>${t(state.locale, 'export')}</span></button>
            `,
          )}
        </div>
        <div class="ribbon-pane" role="tabpanel" id="ribbon-panel-home" aria-labelledby="ribbon-tab-home" tabindex=${state.tab === 'home' ? '0' : '-1'} ?hidden=${state.tab !== 'home'}>
          ${cluster(
            state.locale,
            'ribbonGroupClipboard',
            html`
              ${bigBtn(state.locale, 'paste', 'clipboard', 'paste', 'blue', !state.canPaste, cb.onPaste)}
              <div class="ribbon-smallcol">
                ${cmd(state.locale, 'cut', 'cut', 'cut', !state.canCut, cb.onCut)}
                ${cmd(state.locale, 'copy', 'copy', 'copy', !state.canCut, cb.onCopy)}
                <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-format-painter" ?disabled=${!state.canCut}><span>${t(state.locale, 'formatPainter')}</span></button>
              </div>
            `,
          )}
          ${cluster(
            state.locale,
            'ribbonGroupFont',
            html`
              <div class="ribbon-fontcol">
                <div class="row">
                  <select
                    data-testid="ribbon-font-family"
                    ?disabled=${!font.enabled}
                    @change=${(ev: Event) => cb.onStyle({ font: (ev.target as HTMLSelectElement).value || undefined })}
                  >
                    <option value="" ?selected=${font.family === ''}>—</option>
                    ${FONT_FAMILIES.map((family) => html`<option value=${family} ?selected=${font.family === family}>${family}</option>`)}
                  </select>
                  <input
                    data-testid="ribbon-font-size"
                    type="text"
                    inputmode="numeric"
                    ?disabled=${!font.enabled}
                    .value=${fontSizeLabel}
                    @change=${(ev: Event) => {
                      const size = parseLocalizedNumber((ev.target as HTMLInputElement).value);
                      if (Number.isFinite(size)) cb.onStyle({ fontSize: size });
                    }}
                  />
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-font-grow" aria-label=${t(state.locale, 'growFont')} ?disabled=${!font.enabled} @click=${() => cb.onStyle({ fontSize: font.size + 1 })}>A+</button>
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-font-shrink" aria-label=${t(state.locale, 'shrinkFont')} ?disabled=${!font.enabled} @click=${() => cb.onStyle({ fontSize: font.size - 1 })}>A−</button>
                </div>
                <div class="row">
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-font-bold" aria-label=${t(state.locale, 'bold')} title=${t(state.locale, 'bold')} aria-pressed=${font.bold ? 'true' : 'false'} ?disabled=${!font.enabled} @click=${() => cb.onStyle({ bold: !font.bold })}>${icon('bold')}</button>
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-font-italic" aria-label=${t(state.locale, 'italic')} title=${t(state.locale, 'italic')} aria-pressed=${font.italic ? 'true' : 'false'} ?disabled=${!font.enabled} @click=${() => cb.onStyle({ italic: !font.italic })}>${icon('italic')}</button>
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-font-underline" aria-label=${t(state.locale, 'underline')} title=${t(state.locale, 'underline')} aria-pressed=${font.underline ? 'true' : 'false'} ?disabled=${!font.enabled} @click=${() => cb.onStyle({ underline: !font.underline })}>${icon('underline')}</button>
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-font-strike" aria-label=${t(state.locale, 'strike')} title=${t(state.locale, 'strike')} aria-pressed=${font.strike ? 'true' : 'false'} ?disabled=${!font.enabled} @click=${() => cb.onStyle({ strike: !font.strike })}>${icon('strike')}</button>
                  <input data-testid="ribbon-font-color" type="color" ?disabled=${!font.enabled} .value=${colorInputValue(font.color)} @input=${(ev: Event) => cb.onStyle({ color: (ev.target as HTMLInputElement).value })} />
                </div>
              </div>
            `,
          )}
          ${cluster(
            state.locale,
            'ribbonGroupAlign',
            html`
              <div class="ribbon-fontcol">
                <div class="row">
                  ${alignBtn(state, 'alignStart', 'start', font.align === 'start', cb)}
                  ${alignBtn(state, 'alignCenter', 'center', font.align === 'center', cb)}
                  ${alignBtn(state, 'alignEnd', 'end', font.align === 'end', cb)}
                  ${alignBtn(state, 'alignJustify', 'justify', font.align === 'justify', cb)}
                </div>
                <div class="row">
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-valign-start" aria-label=${t(state.locale, 'alignTop')} ?disabled=${!font.enabled}>${icon('valignStart')}</button>
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-valign-center" aria-label=${t(state.locale, 'alignMiddle')} ?disabled=${!font.enabled}>${icon('valignCenter')}</button>
                  <button type="button" class="ribbon-cmd icon-only" data-testid="ribbon-valign-end" aria-label=${t(state.locale, 'alignBottom')} ?disabled=${!font.enabled}>${icon('valignEnd')}</button>
                </div>
              </div>
            `,
          )}
          ${cluster(
            state.locale,
            'border',
            html`
              ${bigBtn(state.locale, 'borders', 'borderAll', 'allBorders', 'slate', !font.enabled, () => cb.onStyle({ border: { top: 0.3, right: 0.3, bottom: 0.3, left: 0.3 } }))}
              <div class="ribbon-smallcol">
                <button type="button" class="ribbon-cmd" data-testid="ribbon-border-none" ?disabled=${!font.enabled} @click=${() => cb.onStyle({ border: { top: 0, right: 0, bottom: 0, left: 0 } })}><span>${t(state.locale, 'noBorders')}</span></button>
                <button type="button" class="ribbon-cmd" data-testid="ribbon-border-bottom" ?disabled=${!font.enabled} @click=${() => cb.onStyle({ border: { top: 0, right: 0, bottom: 0.3, left: 0 } })}><span>${t(state.locale, 'bottomBorder')}</span></button>
                <button type="button" class="ribbon-cmd" data-testid="ribbon-border-weight" ?disabled=${!font.enabled}><span>${t(state.locale, 'borderWeight')}</span></button>
              </div>
            `,
          )}
          ${cluster(
            state.locale,
            'conditional',
            html`
              ${bigBtn(state.locale, 'number-format', 'hash', 'numberFormat', 'teal', false, () => undefined)}
              ${bigBtn(state.locale, 'styles', 'styles', 'styles', 'violet', false, () => undefined)}
              ${bigBtn(state.locale, 'conditional', 'conditional', 'conditionalFormat', 'amber', false, () => undefined)}
            `,
          )}
        </div>
        <div class="ribbon-pane" role="tabpanel" id="ribbon-panel-insert" aria-labelledby="ribbon-tab-insert" tabindex=${state.tab === 'insert' ? '0' : '-1'} ?hidden=${state.tab !== 'insert'}>
          ${cluster(
            state.locale,
            'ribbonGroupInsert',
            html`<div class="ribbon-insert">
              ${TOOL_KINDS.map((tool) => {
                const label = t(state.locale, tool.labelKey);
                return html`
                  <button
                    type="button"
                    class="ribbon-insert-btn"
                    draggable="true"
                    data-testid=${`ribbon-btn-insert-${tool.kind}`}
                    title=${label}
                    aria-label=${label}
                    @dragstart=${(e: DragEvent) => cb.onInsertDragStart(e, tool.kind)}
                  >${toolIconForKind(tool.kind)}<span>${label}</span></button>
                `;
              })}
            </div>`,
          )}
        </div>
        <div class="ribbon-pane" role="tabpanel" id="ribbon-panel-layout" aria-labelledby="ribbon-tab-layout" tabindex=${state.tab === 'layout' ? '0' : '-1'} ?hidden=${state.tab !== 'layout'}>
          ${cluster(
            state.locale,
            'ribbonGroupArrange',
            html`
              ${arrange(state.locale, 'align-start', 'alignStart', !canAlign, () => cb.onArrange('start'))}
              ${arrange(state.locale, 'align-center', 'alignCenter', !canAlign, () => cb.onArrange('center'))}
              ${arrange(state.locale, 'align-end', 'alignEnd', !canAlign, () => cb.onArrange('end'))}
              ${arrange(state.locale, 'align-top', 'alignTop', !canAlign, () => cb.onArrange('top'))}
              ${arrange(state.locale, 'align-middle', 'alignMiddle', !canAlign, () => cb.onArrange('middle'))}
              ${arrange(state.locale, 'align-bottom', 'alignBottom', !canAlign, () => cb.onArrange('bottom'))}
            `,
          )}
          ${cluster(
            state.locale,
            'ribbonGroupDistribute',
            html`
              ${arrange(state.locale, 'distribute-h', 'distributeH', !canDistribute, () => cb.onArrange('distribute-h'))}
              ${arrange(state.locale, 'distribute-v', 'distributeV', !canDistribute, () => cb.onArrange('distribute-v'))}
            `,
          )}
          ${cluster(
            state.locale,
            'ribbonGroupSize',
            html`
              ${arrange(state.locale, 'same-width', 'sameWidth', !canAlign, () => cb.onArrange('same-width'))}
              ${arrange(state.locale, 'same-height', 'sameHeight', !canAlign, () => cb.onArrange('same-height'))}
              ${arrange(state.locale, 'same-size', 'sameSize', !canAlign, () => cb.onArrange('same-size'))}
            `,
          )}
          ${cluster(
            state.locale,
            'ribbonGroupOrder',
            html`
              ${cmd(state.locale, 'bring-to-front', 'bringToFront', 'bringToFront', !state.canBringToFront, cb.onBringToFront)}
              ${cmd(state.locale, 'bring-forward', 'bringForward', 'bringForward', !state.canBringForward, cb.onBringForward)}
              ${cmd(state.locale, 'send-to-back', 'sendToBack', 'sendToBack', !state.canSendToBack, cb.onSendToBack)}
              ${cmd(state.locale, 'send-backward', 'sendBackward', 'sendBackward', !state.canSendBackward, cb.onSendBackward)}
            `,
          )}
        </div>
        <div class="ribbon-pane" role="tabpanel" id="ribbon-panel-page" aria-labelledby="ribbon-tab-page" tabindex=${state.tab === 'page' ? '0' : '-1'} ?hidden=${state.tab !== 'page'}>
          ${cluster(
            state.locale,
            'ribbonGroupPage',
            html`
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-portrait" @click=${cb.onPortrait}>${icon('portrait')}<span>${t(state.locale, 'portrait')}</span></button>
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-landscape" @click=${cb.onLandscape}>${icon('landscape')}<span>${t(state.locale, 'landscape')}</span></button>
            `,
          )}
        </div>
        <div class="ribbon-pane" role="tabpanel" id="ribbon-panel-view" aria-labelledby="ribbon-tab-view" tabindex=${state.tab === 'view' ? '0' : '-1'} ?hidden=${state.tab !== 'view'}>
          ${cluster(
            state.locale,
            'ribbonGroupZoom',
            html`
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-view-zoom-out" @click=${cb.actions.onZoomOut}>${icon('zoomOut')}<span>${t(state.locale, 'zoomOut')}</span></button>
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-view-zoom-in" @click=${cb.actions.onZoomIn}>${icon('zoomIn')}<span>${t(state.locale, 'zoomIn')}</span></button>
              <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-view-zoom-reset" @click=${cb.actions.onZoomReset}>${icon('fitWidth')}<span>${t(state.locale, 'zoomReset')}</span></button>
            `,
          )}
        </div>
        <div class="ribbon-pane" role="tabpanel" id="ribbon-panel-preview" aria-labelledby="ribbon-tab-preview" tabindex=${state.tab === 'preview' ? '0' : '-1'} ?hidden=${state.tab !== 'preview'}>
          <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-preview-tab" @click=${cb.actions.onPreview}>${icon('eye')}<span>${t(state.locale, 'preview')}</span></button>
        </div>
      </div>
    </div>
  `;
}

function onTabsKey(ev: KeyboardEvent, state: RibbonState, cb: RibbonCallbacks): void {
  const next = ribbonTabFromKey(state.tab, ev.key, state.dir);
  if (!next || next === state.tab) return;
  ev.preventDefault();
  ev.stopPropagation();
  cb.onTab(next);
  const list = ev.currentTarget as HTMLElement;
  queueMicrotask(() => list.querySelector<HTMLButtonElement>(`#ribbon-tab-${next}`)?.focus());
}

function cluster(locale: LocaleTag, caption: Parameters<typeof t>[1], body: TemplateResult) {
  return html`<div class="ribbon-cluster"><div class="ribbon-group">${body}</div><span class="ribbon-caption">${t(locale, caption)}</span></div>`;
}

function alignBtn(
  state: RibbonState,
  label: 'alignStart' | 'alignCenter' | 'alignJustify' | 'alignEnd',
  value: NonNullable<Style['align']>,
  pressed: boolean,
  cb: RibbonCallbacks,
) {
  const name = t(state.locale, label);
  return html`<button type="button" class="ribbon-cmd icon-only" data-testid=${`ribbon-align-${value}`} aria-label=${name} title=${name} aria-pressed=${pressed ? 'true' : 'false'} ?disabled=${!state.font.enabled} @click=${() => cb.onStyle({ align: value })}>${icon(value === 'start' ? 'alignStart' : value === 'center' ? 'alignCenter' : value === 'end' ? 'alignEnd' : 'alignJustify')}</button>`;
}

function arrange(locale: LocaleTag, id: string, label: Parameters<typeof t>[1], disabled: boolean, action: () => void) {
  return html`<button type="button" class="ribbon-cmd" data-testid=${`ribbon-btn-${id}`} ?disabled=${disabled} @click=${action}><span>${t(locale, label)}</span></button>`;
}

function bigBtn(
  locale: LocaleTag,
  id: string,
  iconName: string,
  labelKey: Parameters<typeof t>[1],
  tone: 'blue' | 'teal' | 'amber' | 'violet' | 'slate',
  disabled: boolean,
  action: () => void,
) {
  const label = t(locale, labelKey);
  return html`<button type="button" class="ribbon-big c-${tone}" data-testid=${`ribbon-btn-${id}`} aria-label=${label} title=${label} ?disabled=${disabled} @click=${action}><span class="ic">${icon(iconName)}</span><span>${label}</span></button>`;
}

function cmd(
  locale: LocaleTag,
  id: string,
  iconName: string,
  labelKey: 'cut' | 'copy' | 'paste' | 'delete' | 'bringToFront' | 'bringForward' | 'sendToBack' | 'sendBackward',
  disabled: boolean,
  action: () => void,
  iconOnly = false,
) {
  const label = t(locale, labelKey);
  return html`<button type="button" class="ribbon-cmd ${iconOnly ? 'icon-only' : ''}" data-testid=${`ribbon-btn-${id}`} aria-label=${label} title=${label} ?disabled=${disabled} @click=${action}>${icon(iconName)}${iconOnly ? nothing : html`<span>${label}</span>`}</button>`;
}

async function readOpenFile(ev: Event, onOpenText: (text: string) => void): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  onOpenText(await file.text());
}
