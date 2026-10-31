import { html, nothing } from 'lit';
import type { FieldMeta, LocaleTag } from '@reports-web/shared';
import { t } from '../../../api.js';
import type { ReportElement } from '../../../api.js';

type RichEl = Extract<ReportElement, { kind: 'richtext' }>;
type Patch = Partial<ReportElement>;

export function renderRichTextKind(el: RichEl, fields: readonly FieldMeta[], locale: LocaleTag, update: (patch: Patch) => void) {
  const appendField = (name: string) => update({ content: `${el.content}<${name}>` } as Patch);
  const titleKey = el.mode === 'markdown' ? 'markdown' : 'html';
  return html`
    <div class="group">
      <h4>${t(locale, titleKey)}</h4>
      <p class="hint">${t(locale, 'fieldPlaceholderHint')}</p>
      <label>${t(locale, 'content')}
        <textarea data-testid="prop-content" rows="8" .value=${el.content} @input=${(e: Event) => update({ content: (e.target as HTMLTextAreaElement).value } as Patch)}></textarea>
      </label>
      <label>format<input data-testid="prop-format" .value=${el.format ?? ''} placeholder="decimal2, date" @input=${(e: Event) => update({ format: (e.target as HTMLInputElement).value || undefined } as Patch)} /></label>
      ${fields.length
        ? html`<div class="field-chips">${fields.map((f) => html`<button type="button" class="chip" @click=${() => appendField(f.name)}>&lt;${f.name}&gt;</button>`)}</div>`
        : nothing}
    </div>
  `;
}
