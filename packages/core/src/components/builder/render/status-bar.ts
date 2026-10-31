import type { LocaleTag } from '@reports-web/shared';
import { html, type TemplateResult } from 'lit';
import { t } from '../api.js';
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

export function renderStatusBar(
  state: StatusBarState,
  extra?: TemplateResult,
  onZoom?: (zoom: number) => void,
) {
  const fmt = { locale: state.locale, digits: state.digits };
  const selection = state.selection;
  const pos = selection
    ? `${formatLocalizedNumber(selection.w, fmt, 1)} × ${formatLocalizedNumber(selection.h, fmt, 1)}`
    : '—';
  return html`
    <footer class="status-bar" data-testid="status-bar">
      <span class="status-item zoom" data-testid="status-zoom">
        <input
          data-testid="status-zoom-slider"
          type="range"
          min=${String(MIN_BUILDER_ZOOM)}
          max=${String(MAX_BUILDER_ZOOM)}
          step="0.05"
          .value=${String(state.zoom)}
          aria-label=${t(state.locale, 'zoomReset')}
          @input=${(e: Event) => onZoom?.(Number((e.target as HTMLInputElement).value))}
        />
        <b>${formatZoomPercent(state.zoom, fmt)}</b>
      </span>
      <span class="status-item" data-testid="status-units">${t(state.locale, 'unitCm')}</span>
      <span class="status-item" data-testid="status-cursor">${t(state.locale, 'statusCursor')} <span data-testid="status-cursor-value"></span></span>
      <span class="status-item" data-testid="status-selection">${t(state.locale, 'statusSelection')} ${formatSelectionSummary(state.selection, fmt)}</span>
      <span class="status-item" data-testid="status-position">${pos}</span>
      <span class="status-item" data-testid="status-page">${t(state.locale, 'statusPage')} ${formatPageIndicator(state.page, state.pages, fmt)}</span>
      <span class="status-spacer"></span>
      ${extra ?? ''}
    </footer>
  `;
}
