import type { LocaleTag } from '@reports-web/shared';
import { html } from 'lit';
import { icon, t } from '../api.js';
import { formatLocalizedNumber, formatPageIndicator, formatSelectionSummary, formatZoomPercent } from '../status-bar.js';
import { MAX_BUILDER_ZOOM, MIN_BUILDER_ZOOM } from '../types.js';

export interface StatusBarState {
  locale: LocaleTag;
  digits: 'locale' | 'latn';
  zoom: number;
  cursor: { x: number; y: number } | null;
  selection: { name: string; w: number; h: number } | null;
  page: number;
  pages: number;
}

export interface StatusZoomHandlers {
  onIn: () => void;
  onOut: () => void;
  onReset: () => void;
  onSet: (zoom: number) => void;
}

export function renderStatusBar(state: StatusBarState, zoom?: StatusZoomHandlers) {
  const fmt = { locale: state.locale, digits: state.digits };
  const selection = state.selection;
  const pos = selection
    ? `${formatLocalizedNumber(selection.w, fmt, 1)} × ${formatLocalizedNumber(selection.h, fmt, 1)} ${t(state.locale, 'unitCm')}`
    : '—';
  return html`
    <footer class="status-bar" data-testid="status-bar">
      <span class="status-item zoom" data-testid="status-zoom">
        <button type="button" class="qa-btn" data-control="zoom-out" data-testid="ribbon-btn-zoom-out" aria-label=${t(state.locale, 'zoomOut')} ?disabled=${state.zoom <= MIN_BUILDER_ZOOM} @click=${() => zoom?.onOut()}>${icon('zoomOut')}</button>
        <input
          data-testid="status-zoom-slider"
          type="range"
          min=${String(MIN_BUILDER_ZOOM)}
          max=${String(MAX_BUILDER_ZOOM)}
          step="0.05"
          .value=${String(state.zoom)}
          aria-label=${t(state.locale, 'zoomReset')}
          @input=${(e: Event) => zoom?.onSet(Number((e.target as HTMLInputElement).value))}
        />
        <button type="button" class="zoom-value" data-control="zoom-reset" data-testid="ribbon-btn-zoom-reset" aria-label=${t(state.locale, 'zoomReset')} @click=${() => zoom?.onReset()}>${formatZoomPercent(state.zoom, fmt)}</button>
        <button type="button" class="qa-btn" data-control="zoom-in" data-testid="ribbon-btn-zoom-in" aria-label=${t(state.locale, 'zoomIn')} ?disabled=${state.zoom >= MAX_BUILDER_ZOOM} @click=${() => zoom?.onIn()}>${icon('zoomIn')}</button>
      </span>
      <span class="status-item" data-testid="status-units">${t(state.locale, 'unitCm')}</span>
      <span class="status-item" data-testid="status-cursor">${t(state.locale, 'statusCursor')} <span data-testid="status-cursor-value"></span></span>
      <span class="status-item" data-testid="status-selection">${t(state.locale, 'statusSelection')} ${formatSelectionSummary(state.selection, fmt)}</span>
      <span class="status-item" data-testid="status-position">${pos}</span>
      <span class="status-item" data-testid="status-page">${t(state.locale, 'statusPage')} ${formatPageIndicator(state.page, state.pages, fmt)}</span>
    </footer>
  `;
}
