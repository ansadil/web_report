import { html } from 'lit';
import { rulerMarks, rulerTickInsetPx } from '../ruler.js';

export interface RulerState {
  widthMm: number;
  heightMm: number;
  zoom: number;
  dir: 'ltr' | 'rtl';
}

export function renderHorizontalRuler(state: RulerState) {
  return html`
    <div class="ruler ruler-h" data-testid="ruler-h" dir=${state.dir}>
      ${rulerMarks(state.widthMm).map(
        (mark) => html`
          <span
            class="ruler-tick ${mark.major ? 'major' : ''}"
            style="inset-inline-start:${rulerTickInsetPx(mark.mm, state.zoom)}px"
          >${mark.major ? String(mark.mm) : ''}</span>
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
          <span class="ruler-tick ${mark.major ? 'major' : ''}" style="top:${rulerTickInsetPx(mark.mm, state.zoom)}px"
            >${mark.major ? String(mark.mm) : ''}</span
          >
        `,
      )}
    </div>
  `;
}
