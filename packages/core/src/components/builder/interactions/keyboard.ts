import type { ReactiveController, ReactiveControllerHost } from 'lit';
import {
  clearSelection,
  closeContextMenu,
  copySelected,
  cutSelected,
  deleteSelected,
  nudgeSelected,
  pasteClipboard,
  performRedo,
  performUndo,
} from '../ops/commands.js';
import type { BuilderSession } from '../session.js';

export function isEditableKeyboardTarget(ev: KeyboardEvent): boolean {
  const target = ev.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export class KeyboardController implements ReactiveController {
  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    const key = ev.key.toLowerCase();
    const isModifier = ev.ctrlKey || ev.metaKey;
    if (isEditableKeyboardTarget(ev)) return;
    if (isModifier && !ev.altKey && key === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) performRedo(this.session);
      else performUndo(this.session);
    } else if (isModifier && !ev.altKey && key === 'y') {
      ev.preventDefault();
      performRedo(this.session);
    } else if (isModifier && !ev.altKey && key === 'c') {
      if (!copySelected(this.session)) return;
      ev.preventDefault();
    } else if (isModifier && !ev.altKey && key === 'x') {
      if (!cutSelected(this.session)) return;
      ev.preventDefault();
    } else if (isModifier && !ev.altKey && key === 'v') {
      if (!pasteClipboard(this.session)) return;
      ev.preventDefault();
    } else if (!isModifier && !ev.altKey && nudgeSelected(this.session, ev)) {
      ev.preventDefault();
    } else if (!isModifier && !ev.altKey && key === 'delete') {
      if (this.session.selectedIds.size === 0) return;
      ev.preventDefault();
      deleteSelected(this.session);
    } else if (!isModifier && !ev.altKey && key === 'escape') {
      if (this.session.contextMenu) {
        ev.preventDefault();
        closeContextMenu(this.session);
        return;
      }
      if (this.session.selectedIds.size === 0) return;
      ev.preventDefault();
      clearSelection(this.session);
    }
  };

  constructor(
    private readonly session: BuilderSession,
    private readonly host: HTMLElement & ReactiveControllerHost,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.host.addEventListener('keydown', this.onKeyDown);
  }

  hostDisconnected(): void {
    this.host.removeEventListener('keydown', this.onKeyDown);
  }
}
