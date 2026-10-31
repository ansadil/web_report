import type { LocaleTag } from '@reports-web/shared';
import { html } from 'lit';
import { t } from '../api.js';
import { formatPageIndicator, formatSelectionSummary, formatZoomPercent } from '../status-bar.js';

export interface StatusBarState {
  locale: LocaleTag;
  digits: 'locale' | 'latn';
  zoom: number;
  cursor: { x: number; y: number } | null;
  selection: { name: string; w: number; h: number } | null;
  page: number;
  pages: number;
}

export function renderStatusBar(state: StatusBarState) {
  const fmt = { locale: state.locale, digits: state.digits };
  return html`
    <footer class="status-bar" data-testid="status-bar">
      <span class="status-item" data-testid="status-zoom"><b>${formatZoomPercent(state.zoom, fmt)}</b></span>
      <span class="status-item" data-testid="status-cursor">${t(state.locale, 'statusCursor')} <span data-testid="status-cursor-value"></span></span>
      <span class="status-item" data-testid="status-selection">${t(state.locale, 'statusSelection')} ${formatSelectionSummary(state.selection, fmt)}</span>
      <span class="status-item" data-testid="status-page">${t(state.locale, 'statusPage')} ${formatPageIndicator(state.page, state.pages, fmt)}</span>
    </footer>
  `;
}
