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
  onToolInsert: (kind: ToolKind) => void;
  onFieldDragStart: (ev: DragEvent, field: FieldMeta) => void;
}

function fieldTypeKey(type: string): 'typeString' | 'typeNumber' | 'typeDate' | 'typeBool' | 'typeImage' {
  if (type === 'number') return 'typeNumber';
  if (type === 'date') return 'typeDate';
  if (type === 'bool') return 'typeBool';
  if (type === 'image') return 'typeImage';
  return 'typeString';
}

export function renderToolbox(state: ToolboxState, cb: ToolboxCallbacks) {
  return html`
    <div class="tool-grid">
      ${TOOL_KINDS.map((tool) => {
        const label = t(state.locale, tool.labelKey);
        return html`
          <button
            type="button"
            class="tool"
            draggable="true"
            data-testid=${`tool-${tool.kind}`}
            tabindex="0"
            title=${label}
            aria-label=${label}
            @dragstart=${(e: DragEvent) => cb.onToolDragStart(e, tool.kind)}
            @click=${() => cb.onToolInsert(tool.kind)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              cb.onToolInsert(tool.kind);
            }}
          >
            ${toolIconForKind(tool.kind)}
          </button>
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
                <span class="type">${t(state.locale, fieldTypeKey(f.type))}</span>
              </div>
            `,
          )}
        </div>`}
  `;
}
