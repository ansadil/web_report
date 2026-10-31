import type { LocaleTag } from '@reports-web/shared';
import { html, nothing } from 'lit';
import { icon, t } from '../api.js';

export interface ContextMenuView {
  locale: LocaleTag;
  x: number;
  y: number;
  hasSelection: boolean;
  canPaste: boolean;
  canRemoveBand: boolean;
  canBringToFront: boolean;
  canBringForward: boolean;
  canSendToBack: boolean;
  canSendBackward: boolean;
}

export interface ContextMenuCallbacks {
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onRemoveSection: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendToBack: () => void;
  onSendBackward: () => void;
}

export function renderContextMenu(state: ContextMenuView | null, cb: ContextMenuCallbacks) {
  if (!state) return nothing;
  const item = (
    key: 'cut' | 'copy' | 'paste' | 'delete' | 'bringToFront' | 'bringForward' | 'sendToBack' | 'sendBackward',
    iconName: string,
    disabled: boolean,
    action: () => void,
  ) => html`
    <li role="none">
      <button type="button" role="menuitem" data-ctx=${key} ?disabled=${disabled} @click=${action}>${icon(iconName)}<span>${t(state.locale, key)}</span></button>
    </li>
  `;
  return html`
    <ul
      class="ctx-menu"
      data-testid="context-menu"
      role="menu"
      style="left:${state.x}px;top:${state.y}px"
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      ${item('cut', 'cut', !state.hasSelection, cb.onCut)}
      ${item('copy', 'copy', !state.hasSelection, cb.onCopy)}
      ${item('paste', 'paste', !state.canPaste, cb.onPaste)}
      ${item('delete', 'trash', !state.hasSelection, cb.onDelete)}
      ${state.canRemoveBand
        ? html`
            <li class="ctx-sep" role="separator"></li>
            <li role="none">
              <button type="button" role="menuitem" data-ctx="removeSection" @click=${cb.onRemoveSection}>${icon('trash')}<span>${t(state.locale, 'removeSection')}</span></button>
            </li>
          `
        : nothing}
      <li class="ctx-sep" role="separator"></li>
      ${item('bringToFront', 'bringToFront', !state.canBringToFront, cb.onBringToFront)}
      ${item('bringForward', 'bringForward', !state.canBringForward, cb.onBringForward)}
      ${item('sendToBack', 'sendToBack', !state.canSendToBack, cb.onSendToBack)}
      ${item('sendBackward', 'sendBackward', !state.canSendBackward, cb.onSendBackward)}
    </ul>
  `;
}
