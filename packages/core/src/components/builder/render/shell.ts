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
import { renderActions } from './toolbar.js';
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
  const sideHidden = (tab: 'dictionary' | 'tools' | 'reportTree') => state.sideTab !== tab;
  return html`
    <header class="titlebar" data-testid="titlebar">
      <div class="brand">${icon('layers')}<b>web_report</b><span class="product">${t(state.uiLocale, 'designerProduct')}</span></div>
      <div class="qa">
        <button type="button" class="qa-btn" data-control="undo" data-testid="ribbon-btn-undo" aria-label=${t(state.uiLocale, 'undo')} title=${t(state.uiLocale, 'undo')} ?disabled=${!state.actions.canUndo} @click=${cb.actions.onUndo}>${icon('undo')}</button>
        <button type="button" class="qa-btn" data-control="redo" data-testid="ribbon-btn-redo" aria-label=${t(state.uiLocale, 'redo')} title=${t(state.uiLocale, 'redo')} ?disabled=${!state.actions.canRedo} @click=${cb.actions.onRedo}>${icon('redo')}</button>
        <button type="button" class="qa-btn" data-testid="title-save" aria-label=${t(state.uiLocale, 'save')} title=${t(state.uiLocale, 'save')} @click=${cb.actions.onSave}>${icon('save')}</button>
      </div>
      <div class="doc-center">
        <input
          id="report-name"
          class="name"
          data-testid="report-name"
          aria-label=${t(state.uiLocale, 'document')}
          .value=${state.name}
          @input=${(e: Event) => cb.actions.onNameInput((e.target as HTMLInputElement).value)}
        />
        <span class="saved">${t(state.uiLocale, 'savedState')}</span>
      </div>
      <div class="tb-end">
        <span>${t(state.uiLocale, state.uiDir === 'rtl' ? 'localeRtl' : 'localeLtr')}</span>
        <span class="avatar" aria-hidden="true">${icon('user')}</span>
      </div>
    </header>
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
        : html`<div class="side-tabs" role="tablist">
            <button type="button" class=${state.sideTab === 'dictionary' ? 'on' : ''} @click=${() => cb.onSideTab('dictionary')}>${icon('database')}<span>${t(state.uiLocale, 'dictionary')}</span></button>
            <button type="button" class=${state.sideTab === 'tools' ? 'on' : ''} @click=${() => cb.onSideTab('tools')}>${icon('toolBox')}<span>${t(state.uiLocale, 'elements')}</span></button>
            <button type="button" class=${state.sideTab === 'reportTree' ? 'on' : ''} @click=${() => cb.onSideTab('reportTree')}>${icon('layers')}<span>${t(state.uiLocale, 'reportTree')}</span></button>
          </div>
          <div class="side-body">
            <div ?hidden=${sideHidden('dictionary')}>
              ${renderSideSection(
                {
                  key: 'dictionary',
                  title: t(state.uiLocale, 'dictionary'),
                  collapsed: state.collapsed.dictionary,
                  testId: 'dictionary',
                },
                { onToggle: () => cb.onToggleSection('dictionary') },
                renderDictionary(state),
              )}
              <p class="dict-hint">${t(state.uiLocale, 'dictionaryHint')}</p>
            </div>
            <div ?hidden=${sideHidden('tools')}>
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
            </div>
            <div ?hidden=${sideHidden('reportTree')}>
              ${renderSideSection(
                {
                  key: 'reportTree',
                  title: t(state.uiLocale, 'reportTree'),
                  collapsed: state.collapsed.reportTree,
                  testId: 'report-tree',
                },
                { onToggle: () => cb.onToggleSection('reportTree') },
                renderReportTree(state),
              )}
            </div>
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
    <div class="page-tabs" data-testid="page-tabs">
      <button type="button" class="page-tab on"><span>${t(state.uiLocale, 'pageOne')}</span></button>
      <button type="button" class="page-tab add" aria-label=${t(state.uiLocale, 'pageOne')}>${icon('plus')}</button>
    </div>
    <aside class="props" data-testid="properties-dock">
      ${renderSideSection(
        {
          key: 'properties',
          title: t(state.uiLocale, 'propertyGrid'),
          collapsed: state.collapsed.properties,
          testId: 'properties',
        },
        { onToggle: () => cb.onToggleSection('properties') },
        renderProperties(state.properties, cb.properties),
      )}
    </aside>
    <div class="status-host">
      ${renderStatusBar(state.status, renderActions(state.actions, cb.actions), cb.onSetZoom)}
    </div>
  `;
}

function fieldBadge(type: string): string {
  if (type === 'number') return '#';
  if (type === 'date') return 'D';
  if (type === 'bool') return '✓';
  if (type === 'image') return 'I';
  return 'Aa';
}

function renderDictionary(state: BuilderViewState) {
  const source = state.properties.schema.dataset.source;
  const adapter = state.properties.schema.dataset.adapter;
  const fields = state.toolbox.fields;
  const parameters = state.properties.schema.parameters ?? [];
  return html`
    <div class="dict-tools">
      <button type="button" class="qa-btn" title=${t(state.uiLocale, 'dataSources')}>${icon('plus')}</button>
      <button type="button" class="qa-btn" title=${t(state.uiLocale, 'editItem')}>${icon('pencil')}</button>
      <button type="button" class="qa-btn" title=${t(state.uiLocale, 'delete')}>${icon('trash')}</button>
      <button type="button" class="qa-btn" title=${t(state.uiLocale, 'refresh')}>${icon('refresh')}</button>
    </div>
    <div class="dict" data-testid="dictionary-tree">
      <div class="dict-node root">${t(state.uiLocale, 'dataSources')}</div>
      <div class="dict-node source">${source}<span class="tmeta">${adapter}</span></div>
      ${fields.map(
        (field, index) => html`<div class="dict-node field ${index === 0 ? 'cur' : ''}"><span class="tic tic-${field.type}">${fieldBadge(field.type)}</span><span>${field.name}</span><span class="tmeta">${field.type}</span></div>`,
      )}
      <div class="dict-node root">${t(state.uiLocale, 'reportParameters')}</div>
      ${parameters.map((parameter) => html`<div class="dict-node field"><span class="tic">${fieldBadge(parameter.type ?? 'string')}</span><span>${parameter.name}</span><span class="tmeta">${parameter.type ?? ''}</span></div>`)}
      <div class="dict-node root">${t(state.uiLocale, 'systemVariables')}</div>
      <div class="dict-node field"><span class="tic">#</span><span>{page}</span><span class="tmeta">${t(state.uiLocale, 'statusPage')}</span></div>
      <div class="dict-node field"><span class="tic">#</span><span>{pages}</span></div>
      <div class="dict-node field"><span class="tic tic-date">D</span><span>${t(state.uiLocale, 'typeDate')}</span></div>
      <div class="dict-node field"><span class="tic">Aa</span><span>${t(state.uiLocale, 'document')}</span></div>
    </div>
  `;
}

function renderReportTree(state: BuilderViewState) {
  const bands = state.canvas.bands;
  return html`<div class="dict" data-testid="report-tree-list">
    ${Object.entries(bands).map(([band, value]) => html`
      <div class="dict-node root">${t(state.uiLocale, band as 'detail')}</div>
      ${(value?.elements ?? []).map((el) => html`<div class="dict-node field"><span class="tic">${el.kind.slice(0, 1)}</span><span>${'value' in el && el.value ? el.value : el.id}</span></div>`)}
    `)}
  </div>`;
}
