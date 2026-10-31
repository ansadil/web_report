import { html } from 'lit';
import { t } from '../../api.js';
import type { Watermark } from '../../api.js';

export interface WatermarkState {
  locale: 'ar' | 'en';
  watermark: Watermark | undefined;
}

export interface WatermarkCallbacks {
  setWatermark: (next: Watermark | undefined) => void;
}

export function renderWatermarkEditor(state: WatermarkState, cb: WatermarkCallbacks) {
  const wm = state.watermark;
  if (!wm) {
    return html`
      <div class="group">
        <h4>${t(state.locale, 'watermark')}</h4>
        <div class="grid2">
          <button class="secondary" type="button" @click=${() => cb.setWatermark({ kind: 'text', text: 'CONFIDENTIAL', fontSize: 72, color: '#cccccc', opacity: 0.2, rotation: -30 })}>+ ${t(state.locale, 'text')}</button>
          <button class="secondary" type="button" @click=${() => cb.setWatermark({ kind: 'image', src: '', opacity: 0.15, rotation: 0, width: 120 })}>+ ${t(state.locale, 'image')}</button>
        </div>
      </div>
    `;
  }
  const updateText = (patch: Partial<Extract<Watermark, { kind: 'text' }>>) => {
    if (wm.kind !== 'text') return;
    cb.setWatermark({ ...wm, ...patch });
  };
  const updateImage = (patch: Partial<Extract<Watermark, { kind: 'image' }>>) => {
    if (wm.kind !== 'image') return;
    cb.setWatermark({ ...wm, ...patch });
  };
  if (wm.kind === 'text') {
    return html`
      <div class="group">
        <h4>${t(state.locale, 'watermark')} — ${t(state.locale, 'text')}</h4>
        <label>${t(state.locale, 'text')}<input data-testid="prop-watermark-text" .value=${wm.text} @input=${(e: Event) => updateText({ text: (e.target as HTMLInputElement).value })} /></label>
        <label>${t(state.locale, 'expression')}<input data-testid="prop-watermark-expression" placeholder='"DRAFT — " + meta.name' .value=${wm.expression ?? ''} @input=${(e: Event) => updateText({ expression: (e.target as HTMLInputElement).value || undefined })} /></label>
        <div class="grid2">
          <label>${t(state.locale, 'fontSize')}<input data-testid="prop-watermark-font-size" type="number" min="8" max="300" .value=${String(wm.fontSize)} @input=${(e: Event) => updateText({ fontSize: Number((e.target as HTMLInputElement).value) })} /></label>
          <label>${t(state.locale, 'color')}<input data-testid="prop-watermark-color" type="color" .value=${wm.color} @input=${(e: Event) => updateText({ color: (e.target as HTMLInputElement).value })} /></label>
        </div>
        <div class="grid2">
          <label>${t(state.locale, 'opacity')}<input data-testid="prop-watermark-opacity" type="number" min="0" max="1" step="0.05" .value=${String(wm.opacity)} @input=${(e: Event) => updateText({ opacity: Number((e.target as HTMLInputElement).value) })} /></label>
          <label>${t(state.locale, 'rotation')}<input data-testid="prop-watermark-rotation" type="number" min="-180" max="180" .value=${String(wm.rotation)} @input=${(e: Event) => updateText({ rotation: Number((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <button class="danger" type="button" @click=${() => cb.setWatermark(undefined)}>${t(state.locale, 'delete')}</button>
      </div>
    `;
  }
  return html`
    <div class="group">
      <h4>${t(state.locale, 'watermark')} — ${t(state.locale, 'image')}</h4>
      <label>${t(state.locale, 'src')}<input data-testid="prop-watermark-src" placeholder="https://..." .value=${wm.src} @input=${(e: Event) => updateImage({ src: (e.target as HTMLInputElement).value })} /></label>
      <div class="grid2">
        <label>${t(state.locale, 'opacity')}<input data-testid="prop-watermark-opacity" type="number" min="0" max="1" step="0.05" .value=${String(wm.opacity)} @input=${(e: Event) => updateImage({ opacity: Number((e.target as HTMLInputElement).value) })} /></label>
        <label>${t(state.locale, 'rotation')}<input data-testid="prop-watermark-rotation" type="number" min="-180" max="180" .value=${String(wm.rotation)} @input=${(e: Event) => updateImage({ rotation: Number((e.target as HTMLInputElement).value) })} /></label>
      </div>
      <label>w (mm)<input data-testid="prop-watermark-width" type="number" min="10" max="400" .value=${String(wm.width)} @input=${(e: Event) => updateImage({ width: Number((e.target as HTMLInputElement).value) })} /></label>
      <button class="danger" type="button" @click=${() => cb.setWatermark(undefined)}>${t(state.locale, 'delete')}</button>
    </div>
  `;
}
