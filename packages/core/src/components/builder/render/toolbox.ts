import { html } from 'lit';
import type { FieldMeta, LocaleTag } from '@reports-web/shared';
import { resolveLabel, t, toolIconForKind } from '../api.js';
import { TOOL_KINDS, type ToolKind } from '../types.js';

export interface ToolboxState {
  locale: LocaleTag;
  fields: readonly FieldMeta[];
}

export interface ToolboxCallbacks {
  onToolDragStart: (ev: DragEvent, kind: ToolKind) => void;
  onFieldDragStart: (ev: DragEvent, field: FieldMeta) => void;
}

export function renderToolbox(state: ToolboxState, cb: ToolboxCallbacks) {
  return html`
    <div class="tool-grid">
      ${TOOL_KINDS.map((tool) => {
        const label = t(state.locale, tool.labelKey);
        return html`
          <div
            class="tool"
            draggable="true"
            title=${label}
            aria-label=${label}
            @dragstart=${(e: DragEvent) => cb.onToolDragStart(e, tool.kind)}
          >
            ${toolIconForKind(tool.kind)}
          </div>
        `;
      })}
    </div>
    <h3 class="panel-title" style="margin-top:8px">${t(state.locale, 'fields')}</h3>
    ${state.fields.length === 0
      ? html`<div class="empty-hint">No fields</div>`
      : html`<div>
          ${state.fields.map(
            (f) => html`
              <div class="field-row" draggable="true" @dragstart=${(e: DragEvent) => cb.onFieldDragStart(e, f)}>
                <span>${resolveLabel(f.label, state.locale, f.name)}</span>
                <span class="type">${f.type}</span>
              </div>
            `,
          )}
        </div>`}
  `;
}
