import { canvasStyles } from './canvas.js';
import { contextMenuStyles } from './context-menu.js';
import { hostStyles } from './host.js';
import { propertiesStyles } from './properties.js';
import { sideStyles } from './side.js';
import { toolbarStyles } from './toolbar.js';
import { toolboxStyles } from './toolbox.js';

/** One shadow root: area styles composed in a single CSSResult group. */
export const builderStyles = [
  hostStyles,
  sideStyles,
  toolbarStyles,
  canvasStyles,
  toolboxStyles,
  contextMenuStyles,
  propertiesStyles,
];
