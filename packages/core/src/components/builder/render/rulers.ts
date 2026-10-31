import { html } from 'lit';
import { formatLocalizedNumber } from '../status-bar.js';
import { rulerMarks, rulerTickInsetPx, verticalRulerTickTopPx } from '../ruler.js';

export interface RulerState {
  widthMm: number;
  heightMm: number;
  /** Content height of each visible band, in order. Headers are inserted by the tick offset. */
  bandHeightsMm: readonly number[];
  zoom: number;
  dir: 'ltr' | 'rtl';
  locale: string;
  digits: 'locale' | 'latn';
}

export function renderHorizontalRuler(state: RulerState) {
  return html`
    <div class="ruler ruler-h" data-testid="ruler-h" dir=${state.dir}>
      ${rulerMarks(state.widthMm).map(
        (mark) => html`
          <span
            class="ruler-tick ${mark.major ? 'major' : ''}"
            style="inset-inline-start:${rulerTickInsetPx(mark.mm, state.zoom)}px"
          >${mark.major ? formatLocalizedNumber(mark.mm, { locale: state.locale, digits: state.digits }) : ''}</span>
        `,
      )}
    </div>
  `;
}

export function renderVerticalRuler(state: RulerState) {
  return html`
    <div class="ruler ruler-v" data-testid="ruler-v">
      ${rulerMarks(state.heightMm).map(
        (mark) => html`
          <span class="ruler-tick ${mark.major ? 'major' : ''}" style="top:${verticalRulerTickTopPx(mark.mm, state.bandHeightsMm, state.zoom)}px"
            >${mark.major ? formatLocalizedNumber(mark.mm, { locale: state.locale, digits: state.digits }) : ''}</span
          >
        `,
      )}
    </div>
  `;
}
