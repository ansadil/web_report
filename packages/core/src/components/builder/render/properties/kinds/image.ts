import type { LocaleTag } from '@reports-web/shared';
import { html } from 'lit';
import { t } from '../../../api.js';
import type { ReportElement } from '../../../api.js';

type ImageEl = Extract<ReportElement, { kind: 'image' }>;
type Patch = Partial<ReportElement>;

export function renderImageKind(el: ImageEl, locale: LocaleTag, update: (patch: Patch) => void) {
  return html`
    <div class="group">
      <h4>${el.kind}</h4>
      <label>${t(locale, 'src')}<input data-testid="prop-src" .value=${el.src} placeholder="https://..." @input=${(e: Event) => update({ src: (e.target as HTMLInputElement).value } as Patch)} /></label>
      <label>${t(locale, 'alt')}<input data-testid="prop-alt" .value=${el.alt ?? ''} @input=${(e: Event) => update({ alt: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
      <label>${t(locale, 'fit')}
        <select data-testid="prop-fit" @change=${(e: Event) => update({ fit: ((e.target as HTMLSelectElement).value || undefined) as 'contain' } as Patch)}>
          <option value="">-</option>
          <option value="contain" ?selected=${el.fit === 'contain'}>contain</option>
          <option value="cover" ?selected=${el.fit === 'cover'}>cover</option>
          <option value="fill" ?selected=${el.fit === 'fill'}>fill</option>
        </select>
      </label>
    </div>
  `;
}
