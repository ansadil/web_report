import type { ContextMenuCallbacks, ContextMenuView } from './context-menu.js';
import type { CanvasCallbacks, CanvasState } from './canvas.js';
import type { ActionsCallbacks, ActionsState } from './toolbar.js';
import type { ToolboxCallbacks, ToolboxState } from './toolbox.js';
import type { PropertiesCallbacks, PropertiesState } from './properties/panel.js';
import type { LocaleTag } from '@reports-web/shared';
import type { RibbonCallbacks, RibbonState } from './ribbon.js';
import type { StatusBarState } from './status-bar.js';
import type { SideSectionKey } from '../types.js';

export interface BuilderViewState {
  uiLocale: LocaleTag;
  uiDir: 'rtl' | 'ltr';
  canvasDir: 'rtl' | 'ltr';
  leftCollapsed: boolean;
  name: string;
  widthPx: number;
  heightPx: number;
  zoom: number;
  widthMm: number;
  heightMm: number;
  collapsed: Record<SideSectionKey, boolean>;
  ribbon: RibbonState;
  status: StatusBarState;
  actions: ActionsState;
  toolbox: ToolboxState;
  canvas: CanvasState;
  properties: PropertiesState;
  contextMenu: ContextMenuView | null;
}

export interface BuilderViewCallbacks {
  onToggleLeft: () => void;
  onToggleSection: (key: SideSectionKey) => void;
  onHostContextMenu: (ev: Event) => void;
  ribbon: RibbonCallbacks;
  actions: ActionsCallbacks;
  toolbox: ToolboxCallbacks;
  canvas: CanvasCallbacks;
  properties: PropertiesCallbacks;
  contextMenu: ContextMenuCallbacks;
}
