import { html, nothing } from 'lit';
import { icon, t } from '../api.js';
import { renderBands } from './canvas.js';
import { renderContextMenu } from './context-menu.js';
import type { BuilderViewCallbacks, BuilderViewState } from './model.js';
import { renderProperties } from './properties/panel.js';
import { renderRibbon } from './ribbon.js';
import { renderHorizontalRuler, renderVerticalRuler } from './rulers.js';
import { renderSideSection } from './side.js';
import { renderStatusBar } from './status-bar.js';
import { renderToolbox } from './toolbox.js';

/** Top-level layout. Pure: it only reads `state` and calls `cb`. */
export function renderBuilder(state: BuilderViewState, cb: BuilderViewCallbacks) {
  const zoomOrigin = state.canvasDir === 'rtl' ? 'top right' : 'top left';
  const startIcon = state.uiDir === 'rtl' ? 'chevronRight' : 'chevronLeft';
  const rulers = {
    widthMm: state.widthMm,
    heightMm: state.heightMm,
    bandHeightsMm: state.bandHeightsMm,
    zoom: state.zoom,
    dir: state.canvasDir,
    locale: state.uiLocale,
    digits: state.status.digits,
  };
  return html`
    <div class="ribbon-host">
      ${renderRibbon(state.ribbon, cb.ribbon)}
    </div>
    <aside class="left ${state.leftCollapsed ? 'collapsed' : ''}" data-testid="side">
      <div class="panel-head">
        <span class="title">${state.name}</span>
        <button
          type="button"
          class="collapse"
          data-control="toggle-left"
          aria-label=${t(state.uiLocale, state.leftCollapsed ? 'show' : 'hide')}
          @click=${cb.onToggleLeft}
        >
          ${icon(state.leftCollapsed ? 'panelLeft' : startIcon)}
        </button>
      </div>
      ${state.leftCollapsed
        ? nothing
        : html`<div class="side-body">
            ${renderSideSection(
              {
                key: 'dictionary',
                title: t(state.uiLocale, 'dictionary'),
                collapsed: state.collapsed.dictionary,
                testId: 'dictionary',
              },
              { onToggle: () => cb.onToggleSection('dictionary') },
              html`<p class="empty-hint">${t(state.uiLocale, 'comingLater')}</p>`,
            )}
            ${renderSideSection(
              {
                key: 'tools',
                title: t(state.uiLocale, 'toolbox'),
                collapsed: state.collapsed.tools,
                testId: 'toolbox',
              },
              { onToggle: () => cb.onToggleSection('tools') },
              renderToolbox(state.toolbox, cb.toolbox),
            )}
            ${renderSideSection(
              {
                key: 'reportTree',
                title: t(state.uiLocale, 'reportTree'),
                collapsed: state.collapsed.reportTree,
                testId: 'report-tree',
              },
              { onToggle: () => cb.onToggleSection('reportTree') },
              html`<p class="empty-hint">${t(state.uiLocale, 'comingLater')}</p>`,
            )}
            ${renderSideSection(
              {
                key: 'properties',
                title: t(state.uiLocale, 'properties'),
                collapsed: state.collapsed.properties,
                testId: 'properties',
              },
              { onToggle: () => cb.onToggleSection('properties') },
              renderProperties(state.properties, cb.properties),
            )}
          </div>`}
    </aside>

    <main class="center" @contextmenu=${cb.onHostContextMenu}>
      <div class="sheet">
        <div class="ruler-corner" data-testid="ruler-corner"></div>
        ${renderHorizontalRuler(rulers)}
        ${renderVerticalRuler(rulers)}
        <div class="canvas-zoom" style="width:${state.widthPx * state.zoom}px;height:${state.heightPx * state.zoom}px">
          <div
            class="canvas"
            data-testid="canvas"
            style="width:${state.widthPx}px;transform:scale(${state.zoom});transform-origin:${zoomOrigin}"
            dir=${state.canvasDir}
            @pointerleave=${cb.onCanvasPointerLeave}
          >
            ${renderBands(state.canvas, cb.canvas)}
          </div>
        </div>
      </div>
      ${renderContextMenu(state.contextMenu, cb.contextMenu)}
    </main>
    <div class="status-host">
      ${renderStatusBar(state.status)}
    </div>
  `;
}
