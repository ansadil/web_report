import type { LocaleTag } from '@reports-web/shared';
import { html, nothing } from 'lit';
import { icon, t } from '../api.js';
import { formatZoomPercent } from '../status-bar.js';
import {
  BUILDER_DEFAULT_ACTIONS,
  MAX_BUILDER_ZOOM,
  MIN_BUILDER_ZOOM,
  type BuilderAction,
} from '../types.js';

export interface ActionsState {
  locale: LocaleTag;
  name: string;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  /** `latn` keeps Western digits. Otherwise digits follow the UI locale. */
  digits: 'locale' | 'latn';
  actions: readonly BuilderAction[];
  menuOpen: boolean;
}

export interface ActionsCallbacks {
  onNameInput: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleMenu: () => void;
  onToggleAction: (action: BuilderAction) => void;
  onSave: () => void;
  onExportJson: () => void;
  onPreview: () => void;
}

export function renderActions(state: ActionsState, cb: ActionsCallbacks) {
  const items = (state.actions ?? BUILDER_DEFAULT_ACTIONS).filter((a) => a === 'save' || a === 'json' || a === 'preview');
  const zoomLabel = formatZoomPercent(state.zoom, { locale: state.locale, digits: state.digits });
  return html`
    <div class="toolbar" role="toolbar" data-testid="toolbar">
      <div class="zoom-tools" aria-label=${t(state.locale, 'zoomReset')}>
        <button
          type="button"
          class="icon-only"
            data-control="zoom-out"
            data-testid="ribbon-btn-zoom-out"
          aria-label=${t(state.locale, 'zoomOut')}
          title=${t(state.locale, 'zoomOut')}
          ?disabled=${state.zoom <= MIN_BUILDER_ZOOM}
          @click=${cb.onZoomOut}
        >${icon('zoomOut')}</button>
        <button
          type="button"
          class="zoom-value"
            data-control="zoom-reset"
            data-testid="ribbon-btn-zoom-reset"
          aria-label=${t(state.locale, 'zoomReset')}
          title=${t(state.locale, 'zoomReset')}
          @click=${cb.onZoomReset}
        >${zoomLabel}</button>
        <button
          type="button"
          class="icon-only"
            data-control="zoom-in"
            data-testid="ribbon-btn-zoom-in"
          aria-label=${t(state.locale, 'zoomIn')}
          title=${t(state.locale, 'zoomIn')}
          ?disabled=${state.zoom >= MAX_BUILDER_ZOOM}
          @click=${cb.onZoomIn}
        >${icon('zoomIn')}</button>
      </div>
      <span class="sep"></span>
      ${items.map((a) => renderToolbarAction(state, cb, a))}
      <div class="customize">
        <button
          type="button"
          class="icon-only"
          data-control="customize"
          aria-label=${t(state.locale, 'customize')}
          title=${t(state.locale, 'customize')}
          aria-expanded=${state.menuOpen ? 'true' : 'false'}
          @click=${cb.onToggleMenu}
        >${icon('cog')}</button>
        ${state.menuOpen
          ? html`<div class="menu" role="menu" @click=${(e: Event) => e.stopPropagation()}>
              ${(['save', 'json', 'preview'] as const).map(
                (a) => html`<label>
                  <input type="checkbox" .checked=${state.actions.includes(a)} @change=${() => cb.onToggleAction(a)} />
                  ${a === 'json' ? html`JSON` : t(state.locale, a === 'save' ? 'save' : 'preview')}
                </label>`,
              )}
            </div>`
          : nothing}
      </div>
    </div>
  `;
}

function renderToolbarAction(state: ActionsState, cb: ActionsCallbacks, a: BuilderAction) {
  if (a === 'save') {
    return html`<button
      type="button"
        data-action="save"
        data-testid="ribbon-btn-save"
      class="primary"
      aria-label=${t(state.locale, 'save')}
      title=${t(state.locale, 'save')}
      @click=${cb.onSave}
    >${icon('save')}<span class="label">${t(state.locale, 'save')}</span></button>`;
  }
  if (a === 'json') {
    return html`<button
      type="button"
        data-action="json"
        data-testid="ribbon-btn-json"
      aria-label="JSON"
      title="JSON"
      @click=${cb.onExportJson}
    >${icon('json')}<span class="label">JSON</span></button>`;
  }
  if (a === 'preview') {
    return html`<button
      type="button"
        data-action="preview"
        data-testid="ribbon-btn-preview"
      class="icon-only"
      aria-label=${t(state.locale, 'preview')}
      title=${t(state.locale, 'preview')}
      @click=${cb.onPreview}
    >${icon('eye')}</button>`;
  }
  return nothing;
}
