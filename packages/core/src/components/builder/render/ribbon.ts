import type { LocaleTag } from '@reports-web/shared';
import { html } from 'lit';
import { icon, t, toolIconForKind } from '../api.js';
import { TOOL_KINDS, type RibbonTab, type ToolKind } from '../types.js';
import { renderActions, type ActionsCallbacks, type ActionsState } from './toolbar.js';

export interface RibbonState {
  locale: LocaleTag;
  tab: RibbonTab;
  actions: ActionsState;
  canCut: boolean;
  canPaste: boolean;
  canBringToFront: boolean;
  canBringForward: boolean;
  canSendToBack: boolean;
  canSendBackward: boolean;
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
}

const TABS: { id: RibbonTab; label: 'ribbonHome' | 'ribbonInsert' | 'ribbonPage' | 'ribbonView' | 'preview' }[] = [
  { id: 'home', label: 'ribbonHome' },
  { id: 'insert', label: 'ribbonInsert' },
  { id: 'page', label: 'ribbonPage' },
  { id: 'view', label: 'ribbonView' },
  { id: 'preview', label: 'preview' },
];

export function renderRibbon(state: RibbonState, cb: RibbonCallbacks) {
  return html`
    <div class="ribbon" data-testid="ribbon">
      <div class="ribbon-tabs" role="tablist">
        ${TABS.map(
          (tab) => html`
            <button
              type="button"
              class="ribbon-tab ${state.tab === tab.id ? 'active' : ''}"
              role="tab"
              data-testid=${`ribbon-tab-${tab.id}`}
              aria-selected=${state.tab === tab.id ? 'true' : 'false'}
              @click=${() => cb.onTab(tab.id)}
            >${t(state.locale, tab.label)}</button>
          `,
        )}
      </div>
      <div class="ribbon-body">
        <div class="ribbon-pane" ?hidden=${state.tab !== 'home'}>
          ${renderActions(state.actions, cb.actions)}
          <div class="ribbon-group">
            ${cmd(state.locale, 'cut', 'cut', 'cut', !state.canCut, cb.onCut)}
            ${cmd(state.locale, 'copy', 'copy', 'copy', !state.canCut, cb.onCopy)}
            ${cmd(state.locale, 'paste', 'paste', 'paste', !state.canPaste, cb.onPaste)}
            ${cmd(state.locale, 'delete', 'trash', 'delete', !state.canCut, cb.onDelete)}
            ${cmd(state.locale, 'bring-to-front', 'bringToFront', 'bringToFront', !state.canBringToFront, cb.onBringToFront)}
            ${cmd(state.locale, 'bring-forward', 'bringForward', 'bringForward', !state.canBringForward, cb.onBringForward)}
            ${cmd(state.locale, 'send-to-back', 'sendToBack', 'sendToBack', !state.canSendToBack, cb.onSendToBack)}
            ${cmd(state.locale, 'send-backward', 'sendBackward', 'sendBackward', !state.canSendBackward, cb.onSendBackward)}
          </div>
        </div>
        <div class="ribbon-pane" ?hidden=${state.tab !== 'insert'}>
          <div class="ribbon-insert">
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
          </div>
        </div>
        <div class="ribbon-pane" ?hidden=${state.tab !== 'page'}>
          <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-portrait" @click=${cb.onPortrait}>${icon('toolBox')}<span>${t(state.locale, 'portrait')}</span></button>
          <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-landscape" @click=${cb.onLandscape}>${icon('fitWidth')}<span>${t(state.locale, 'landscape')}</span></button>
        </div>
        <div class="ribbon-pane" ?hidden=${state.tab !== 'view'}>
          <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-view-zoom-out" @click=${cb.actions.onZoomOut}>${icon('zoomOut')}<span>${t(state.locale, 'zoomOut')}</span></button>
          <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-view-zoom-in" @click=${cb.actions.onZoomIn}>${icon('zoomIn')}<span>${t(state.locale, 'zoomIn')}</span></button>
          <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-view-zoom-reset" @click=${cb.actions.onZoomReset}>${icon('fitWidth')}<span>${t(state.locale, 'zoomReset')}</span></button>
        </div>
        <div class="ribbon-pane" ?hidden=${state.tab !== 'preview'}>
          <button type="button" class="ribbon-cmd" data-testid="ribbon-btn-preview" @click=${cb.actions.onPreview}>${icon('eye')}<span>${t(state.locale, 'preview')}</span></button>
        </div>
      </div>
    </div>
  `;
}

function cmd(
  locale: LocaleTag,
  id: string,
  iconName: string,
  labelKey: 'cut' | 'copy' | 'paste' | 'delete' | 'bringToFront' | 'bringForward' | 'sendToBack' | 'sendBackward',
  disabled: boolean,
  action: () => void,
) {
  return html`<button type="button" class="ribbon-cmd" data-testid=${`ribbon-btn-${id}`} ?disabled=${disabled} @click=${action}>${icon(iconName)}<span>${t(locale, labelKey)}</span></button>`;
}
