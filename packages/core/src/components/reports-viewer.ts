import { LitElement, css, html, nothing } from 'lit';
import { property, state, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { LocaleTag, Row } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { validateReport } from '../schema/report-schema.js';
import type { DataAdapter } from '../adapters/data/index.js';
import { createStaticAdapter } from '../adapters/data/index.js';
import type { ChartAdapter, ChartHandle } from '../adapters/chart/index.js';
import { createChartJsAdapter } from '../adapters/chart/index.js';
import { interpret } from '../engine/interpreter.js';
import { renderHtml } from '../engine/renderer-html.js';
import { t } from '../i18n/strings.js';
import { logger } from '../logging/logger.js';
import { icon } from './icons.js';
import { installDirOverride, resolveDir, resolveLocale } from './direction.js';

type ViewerAction = 'print' | 'pdf' | 'excel' | 'csv' | 'image';
const VIEWER_ACTION_KIND: Record<ViewerAction, 'print' | 'pdf' | 'excel' | 'csv' | 'png'> = {
  print: 'print',
  pdf: 'pdf',
  excel: 'excel',
  csv: 'csv',
  image: 'png',
};
const VIEWER_DEFAULT_ACTIONS: readonly ViewerAction[] = ['print', 'pdf', 'excel', 'image'];

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

function supportsCssZoom(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1');
}

export class ReportsViewerElement extends LitElement {
  static override styles = css`
    :host {
      --rw-bg: #e5e7eb;
      --rw-surface: #ffffff;
      --rw-text: #111111;
      --rw-muted: #6b7280;
      --rw-border: #d1d5db;
      --rw-button-bg: #ffffff;
      --rw-button-hover: #f9fafb;
      --rw-button-text: #111111;
      --rw-accent: #2563eb;
      --rw-error: #b91c1c;
      --rw-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      box-sizing: border-box;
      min-height: 0;
      background: var(--rw-bg);
      padding: 0;
      font-family: var(--rw-font);
      font-size: 12px;
      color: var(--rw-text);
    }
    .toolbar {
      position: sticky;
      top: env(safe-area-inset-top, 0px);
      z-index: 40;
      flex: none;
      display: flex;
      gap: 4px;
      margin: 0;
      padding: 5px 8px;
      flex-wrap: wrap;
      align-items: center;
      align-self: stretch;
      background: var(--rw-bg);
      border-bottom: 1px solid var(--rw-border);
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
    }
    .toolbar-sep {
      width: 1px;
      height: 16px;
      background: var(--rw-border);
      margin: 0 3px;
      flex: none;
      align-self: center;
    }
    .toolbar-spacer {
      flex: 1 1 auto;
      min-width: 8px;
    }
    .zoom-label {
      font-size: 11px;
      color: var(--rw-muted);
      min-width: 4em;
      text-align: center;
      flex: none;
    }
    .toolbar button {
      cursor: pointer;
      border: 1px solid var(--rw-border);
      background: var(--rw-button-bg);
      padding: 4px 7px;
      border-radius: 5px;
      font-size: 11px;
      color: var(--rw-button-text);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      line-height: 1;
    }
    .toolbar button svg {
      flex: none;
      width: 14px;
      height: 14px;
    }
    .toolbar button:hover { background: var(--rw-button-hover); }
    .toolbar button[disabled] { opacity: 0.5; cursor: not-allowed; }
    .toolbar button.view-tool {
      padding: 4px 6px;
    }
    .toolbar button.view-tool .label {
      display: none;
    }
    .status {
      font-size: 11px;
      color: var(--rw-muted);
      max-width: min(40vw, 280px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status.error { color: var(--rw-error); }
    .surface {
      flex: 1 1 auto;
      min-height: 120px;
      max-width: 100%;
      overflow: auto;
      box-sizing: border-box;
      padding: 8px 10px 12px;
    }
    .zoom-host {
      display: block;
      width: max-content;
      max-width: 100%;
      margin-inline: auto;
    }
    .rw-visual-pages-root {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .rw-page-visual-sheet {
      margin-bottom: 16px;
    }
    .rw-page-visual-sheet:last-child {
      margin-bottom: 0;
    }
    .surface .rw-rich-body {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      line-height: 1.35;
    }
    .surface .rw-rich-body :is(p, h1, h2, h3, h4, h5, h6, ul, ol) {
      margin: 0.2em 0;
    }
    .surface .rw-rich-body ul {
      padding-inline-start: 1.2em;
    }
    .surface .rw-rich-body code {
      font-family: ui-monospace, monospace;
      font-size: 0.92em;
    }
    @media print {
      :host {
        background: #fff;
        padding: 0;
        display: block;
      }
      .toolbar { display: none; }
      .surface { padding: 0; }
      .zoom-host { zoom: 1 !important; transform: none !important; }
      .rw-page-visual-sheet {
        page-break-after: always;
        break-after: page;
      }
      .rw-page-visual-sheet:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
  `;

  @property({ attribute: false }) schema: ReportSchemaV1 | null = null;
  @property({ attribute: false }) rows: readonly Row[] | null = null;
  @property({ attribute: false }) dataAdapter: DataAdapter | null = null;
  @property({ attribute: false }) chartAdapter: ChartAdapter | null = null;
  /**
   * Optional host override (BCP 47 tag). When unset, the template's meta.locale is used.
   * UI strings use Arabic for ar / ar-*, else English.
   */
  @property({ type: String }) locale: LocaleTag | undefined = undefined;
  /** Optional host override, set via the `dir` attribute or property. Empty means "follow the template". */
  @property({ type: String, attribute: 'dir' }) dirOverride: '' | 'rtl' | 'ltr' = '';
  private _syncingDir = false;

  override attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === 'dir' && this._syncingDir) return;
    super.attributeChangedCallback(name, old, value);
  }

  private _syncHostDir(effective: 'rtl' | 'ltr'): void {
    if (this.getAttribute('dir') === effective) return;
    this._syncingDir = true;
    try {
      this.setAttribute('dir', effective);
    } finally {
      this._syncingDir = false;
    }
  }

  private get _locale(): LocaleTag {
    return resolveLocale(this.locale, this.schema?.meta);
  }

  private get _dir(): 'rtl' | 'ltr' {
    return resolveDir(this.dirOverride, this.schema?.meta, this._locale);
  }
  @property({ type: Boolean, attribute: 'no-toolbar' }) noToolbar = false;
  @property({ type: Boolean, attribute: 'hide-view-controls' }) hideViewControls = false;
  /** When set, render as one continuous scroll (no stacked page sheets). */
  @property({ type: Boolean, attribute: 'hide-page-boundaries' }) hidePageBoundaries = false;
  @property({ attribute: false }) actions: readonly ViewerAction[] = VIEWER_DEFAULT_ACTIONS;

  @state() private _phase: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  @state() private _error = '';
  @state() private _html = '';
  @state() private _zoom = 1;
  @state() private _pageIndex = 0;
  @state() private _pageCount = 0;

  @query('.surface') private _surface!: HTMLDivElement;

  private _chartHandles: ChartHandle[] = [];
  private _chartIds: readonly string[] = [];
  private _codeIds: readonly string[] = [];
  private readonly _supportsCssZoom = supportsCssZoom();
  private _defaultChart: ChartAdapter | null = null;
  private _abort: AbortController | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void this._renderReport();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._destroyCharts();
    this._clearCodes();
    this._abort?.abort();
  }

  override updated(changed: Map<PropertyKey, unknown>): void {
    this._syncHostDir(this._dir);
    if (
      changed.has('schema') ||
      changed.has('rows') ||
      changed.has('dataAdapter') ||
      changed.has('locale') ||
      changed.has('dir') ||
      changed.has('hidePageBoundaries')
    ) {
      void this._renderReport();
    }
    if (changed.has('_zoom')) {
      queueMicrotask(() => {
        this._destroyCharts();
        this._clearCodes();
        void this.updateComplete.then(() => {
          void this._renderCharts(this._chartIds);
          void this._renderCodes(this._codeIds);
        });
      });
    }
    if ((changed.has('_html') || changed.has('_phase')) && this._phase === 'ready') {
      queueMicrotask(() => this._syncPageNavState());
    }
  }

  async _renderReport(): Promise<void> {
    this._destroyCharts();
    this._clearCodes();
    this._abort?.abort();
    this._abort = new AbortController();

    if (!this.schema) {
      this._phase = 'idle';
      this._html = '';
      this._zoom = 1;
      this._pageIndex = 0;
      this._pageCount = 0;
      this._chartIds = [];
      this._codeIds = [];
      return;
    }
    const validation = validateReport(this.schema);
    if (!validation.ok) {
      this._phase = 'error';
      this._error = validation.error;
      logger.error('reports-viewer', 'invalid schema', { error: validation.error });
      this._html = '';
      this._zoom = 1;
      this._pageIndex = 0;
      this._pageCount = 0;
      this._chartIds = [];
      this._codeIds = [];
      return;
    }

    this._zoom = 1;
    this._pageIndex = 0;

    const finalSchema: ReportSchemaV1 = {
      ...validation.value,
      meta: { ...validation.value.meta, locale: resolveLocale(this.locale, validation.value.meta), dir: resolveDir(this.dirOverride, validation.value.meta, resolveLocale(this.locale, validation.value.meta)) },
    };

    this._phase = 'loading';
    try {
      let rows: readonly Row[];
      if (this.rows) {
        rows = this.rows;
      } else {
        const adapter = this.dataAdapter ?? createStaticAdapter({ tables: {} });
        rows = await adapter.fetch(
          { source: finalSchema.dataset.source, params: finalSchema.dataset.params ?? {} },
          this._abort.signal,
        );
      }
      const tree = interpret({ schema: finalSchema, rows });
      const rendered = renderHtml(tree, { idPrefix: 'rw-v', visualPages: !this.hidePageBoundaries });
      this._html = rendered.html;
      this._chartIds = [...rendered.chartIds];
      this._codeIds = [...rendered.codeIds];
      this._phase = 'ready';
      await this.updateComplete;
      this._renderCharts(this._chartIds);
      void this._renderCodes(this._codeIds);
      this.dispatchEvent(new CustomEvent('report-rendered', { detail: { sections: tree.sections.length, rows: rows.length } }));
    } catch (e) {
      this._phase = 'error';
      this._error = e instanceof Error ? e.message : String(e);
      logger.error('reports-viewer', 'render failed', { error: this._error });
      this._html = '';
      this._chartIds = [];
      this._codeIds = [];
      this._pageCount = 0;
    }
  }

  private _roundZoom(z: number): number {
    return Math.round(z * 100) / 100;
  }

  private _zoomHostStyle(): string {
    const z = this._zoom;
    if (this._supportsCssZoom) return `zoom:${z}`;
    return `transform:scale(${z});transform-origin:top center`;
  }

  private _zoomOut(): void {
    this._zoom = this._roundZoom(Math.max(ZOOM_MIN, this._zoom - ZOOM_STEP));
  }

  private _zoomIn(): void {
    this._zoom = this._roundZoom(Math.min(ZOOM_MAX, this._zoom + ZOOM_STEP));
  }

  private _zoomReset(): void {
    this._zoom = 1;
  }

  private _fitWidth(): void {
    const surface = this._surface;
    const article = surface?.querySelector<HTMLElement>('.rw-report');
    if (!surface || !article) return;
    const pad = 12;
    const avail = Math.max(80, surface.clientWidth - pad);
    const rect = article.getBoundingClientRect();
    const basis = rect.width > 0 ? rect.width / this._zoom : 0;
    if (basis < 1) return;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, avail / basis));
    this._zoom = this._roundZoom(next);
    logger.info('reports-viewer', 'fit width zoom', { zoom: this._zoom });
  }

  private _pageNavTargets(): HTMLElement[] {
    if (!this._surface) return [];
    if (this.hidePageBoundaries) {
      const article = this._surface.querySelector<HTMLElement>('.rw-report');
      return article ? [article] : [];
    }
    return [...this._surface.querySelectorAll<HTMLElement>('.rw-page-visual-sheet')];
  }

  private _syncPageNavState(): void {
    const n = this._pageNavTargets().length;
    let changed = false;
    if (n !== this._pageCount) {
      this._pageCount = n;
      changed = true;
    }
    const clamped = n === 0 ? 0 : Math.min(this._pageIndex, n - 1);
    if (clamped !== this._pageIndex) {
      this._pageIndex = clamped;
      changed = true;
    }
    if (changed) this.requestUpdate();
  }

  private _goPage(delta: number): void {
    const pages = this._pageNavTargets();
    const n = pages.length;
    if (n === 0) return;
    const next = Math.max(0, Math.min(n - 1, this._pageIndex + delta));
    if (next === this._pageIndex && delta !== 0) return;
    this._pageIndex = next;
    requestAnimationFrame(() => {
      pages[this._pageIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  private _renderZoomWrap(): unknown {
    return html`
      <div class="zoom-host" style=${this._zoomHostStyle()}>${unsafeHTML(this._html)}</div>
    `;
  }

  private _renderViewToolbarControls(disabled: boolean): unknown {
    if (this.hideViewControls) return nothing;
    const n = this._pageCount;
    const zLabel = `${Math.round(this._zoom * 100)}%`;
    const pageLabel = n === 0 ? '—' : `${this._pageIndex + 1} / ${n}`;
    const pageDisabled = disabled || n === 0;
    return html`
      <button
        type="button"
        class="view-tool"
        data-control="zoom-out"
        aria-label=${t(this._locale, 'zoomOut')}
        title=${t(this._locale, 'zoomOut')}
        ?disabled=${disabled || this._zoom <= ZOOM_MIN - 1e-6}
        @click=${() => this._zoomOut()}
      >${icon('zoomOut')}<span class="label">${t(this._locale, 'zoomOut')}</span></button>
      <button
        type="button"
        data-control="zoom-reset"
        aria-label=${t(this._locale, 'zoomReset')}
        title=${t(this._locale, 'zoomReset')}
        ?disabled=${disabled || this._zoom === 1}
        @click=${() => this._zoomReset()}
      ><span class="label">${zLabel}</span></button>
      <button
        type="button"
        class="view-tool"
        data-control="zoom-in"
        aria-label=${t(this._locale, 'zoomIn')}
        title=${t(this._locale, 'zoomIn')}
        ?disabled=${disabled || this._zoom >= ZOOM_MAX - 1e-6}
        @click=${() => this._zoomIn()}
      >${icon('zoomIn')}<span class="label">${t(this._locale, 'zoomIn')}</span></button>
      <button
        type="button"
        class="view-tool"
        data-control="fit-width"
        aria-label=${t(this._locale, 'fitWidth')}
        title=${t(this._locale, 'fitWidth')}
        ?disabled=${disabled}
        @click=${() => this._fitWidth()}
      >${icon('fitWidth')}<span class="label">${t(this._locale, 'fitWidth')}</span></button>
      <span class="toolbar-sep" role="separator" aria-hidden="true"></span>
      <button
        type="button"
        class="view-tool"
        data-control="page-prev"
        aria-label=${t(this._locale, 'prevPage')}
        title=${t(this._locale, 'prevPage')}
        ?disabled=${pageDisabled || this._pageIndex <= 0}
        @click=${() => this._goPage(-1)}
      >${icon('sectionUp')}<span class="label">${t(this._locale, 'prevPage')}</span></button>
      <span class="zoom-label" aria-live="polite">${pageLabel}</span>
      <button
        type="button"
        class="view-tool"
        data-control="page-next"
        aria-label=${t(this._locale, 'nextPage')}
        title=${t(this._locale, 'nextPage')}
        ?disabled=${pageDisabled || this._pageIndex >= n - 1}
        @click=${() => this._goPage(1)}
      >${icon('sectionDown')}<span class="label">${t(this._locale, 'nextPage')}</span></button>
    `;
  }

  private _resolveChartAdapter(): ChartAdapter {
    if (this.chartAdapter) return this.chartAdapter;
    if (!this._defaultChart) this._defaultChart = createChartJsAdapter();
    return this._defaultChart;
  }

  private _renderCharts(chartIds: readonly string[]): void {
    if (chartIds.length === 0) return;
    const adapter = this._resolveChartAdapter();
    const root = this._surface;
    if (!root) return;
    for (const id of chartIds) {
      const canvas = root.querySelector<HTMLCanvasElement>(`#${id}`);
      if (!canvas) continue;
      const raw = canvas.dataset.chart;
      if (!raw) continue;
      try {
        const spec = JSON.parse(raw) as { type?: string; labels?: unknown[]; values?: number[]; title?: string };
        if (!spec.type || !Array.isArray(spec.labels) || !Array.isArray(spec.values)) continue;
        canvas.width = Math.max(50, canvas.clientWidth || 200);
        canvas.height = Math.max(30, canvas.clientHeight || 120);
        const handle = adapter.render(canvas, {
          type: spec.type as 'bar' | 'line' | 'pie' | 'doughnut',
          labels: spec.labels,
          values: spec.values,
          title: spec.title,
          dir: this._dir,
        });
        this._chartHandles.push(handle);
      } catch (e) {
        logger.warn('reports-viewer', 'chart render failed', { id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  private _destroyCharts(): void {
    for (const h of this._chartHandles) {
      try { h.destroy(); } catch { /* sink errors */ }
    }
    this._chartHandles = [];
  }

  private _clearCodes(): void {
    const root = this._surface;
    if (!root) return;
    for (const img of root.querySelectorAll<HTMLImageElement>('.rw-code-host')) {
      img.removeAttribute('src');
    }
  }

  private async _renderCodes(codeIds: readonly string[]): Promise<void> {
    if (codeIds.length === 0) return;
    const root = this._surface;
    if (!root) return;
    const { parseCodeSpec, renderCodeToDataUrl } = await import('../adapters/code/render-code.js');
    for (const id of codeIds) {
      const img = root.querySelector<HTMLImageElement>(`#${CSS.escape(id)}`);
      if (!img) continue;
      const raw = img.dataset.rwCode;
      if (!raw) continue;
      const spec = parseCodeSpec(raw);
      if (!spec || !spec.payload.trim()) continue;
      try {
        const w = Math.max(32, img.clientWidth || 120);
        const h = Math.max(32, img.clientHeight || 120);
        const url = await renderCodeToDataUrl(spec, w, h);
        if (url) img.src = url;
      } catch (e) {
        logger.warn('reports-viewer', 'code render failed', { id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  async exportTo(kind: 'pdf' | 'excel' | 'png' | 'csv' | 'print'): Promise<void> {
    if (this._phase !== 'ready' || !this.schema || !this._surface) return;
    const snapshotRoot =
      this._surface.querySelector<HTMLElement>('.rw-visual-pages-root') ??
      this._surface.querySelector<HTMLElement>('.rw-report');
    try {
      if (kind === 'print') {
        const { triggerPrint } = await import('../exporters/print.js');
        const zoomHost = this._surface.querySelector('.zoom-host');
        const printRoot =
          zoomHost?.firstElementChild instanceof HTMLElement ? zoomHost.firstElementChild : null;
        triggerPrint(printRoot);
        this.dispatchEvent(new CustomEvent('export', { detail: { kind } }));
        return;
      }
      const validation = validateReport(this.schema);
      if (!validation.ok) throw new Error(validation.error);
      const finalSchema: ReportSchemaV1 = { ...validation.value, meta: { ...validation.value.meta, locale: resolveLocale(this.locale, validation.value.meta), dir: resolveDir(this.dirOverride, validation.value.meta, resolveLocale(this.locale, validation.value.meta)) } };
      let rows = this.rows;
      if (!rows) {
        const adapter = this.dataAdapter ?? createStaticAdapter({ tables: {} });
        rows = await adapter.fetch({ source: finalSchema.dataset.source, params: finalSchema.dataset.params ?? {} });
      }
      if (kind === 'pdf') {
        const { exportPdf } = await import('../exporters/pdf.js');
        const blob = await exportPdf({ schema: finalSchema, rows });
        this.dispatchEvent(new CustomEvent('export', { detail: { kind, blob, filename: `${finalSchema.id}.pdf` } }));
      } else if (kind === 'excel') {
        const { exportExcel } = await import('../exporters/excel.js');
        const blob = await exportExcel({ schema: finalSchema, rows });
        this.dispatchEvent(new CustomEvent('export', { detail: { kind, blob, filename: `${finalSchema.id}.xlsx` } }));
      } else if (kind === 'csv') {
        const { exportCsv } = await import('../exporters/excel.js');
        const blob = exportCsv({ schema: finalSchema, rows });
        this.dispatchEvent(new CustomEvent('export', { detail: { kind, blob, filename: `${finalSchema.id}.csv` } }));
      } else if (kind === 'png') {
        if (!snapshotRoot) throw new Error('Nothing to capture');
        const { exportPng } = await import('../exporters/image.js');
        const blob = await exportPng(snapshotRoot);
        this.dispatchEvent(new CustomEvent('export', { detail: { kind, blob, filename: `${finalSchema.id}.png` } }));
      }
    } catch (e) {
      logger.error('reports-viewer', 'export failed', { kind, error: e instanceof Error ? e.message : String(e) });
      this.dispatchEvent(new CustomEvent('export-error', { detail: { kind, error: e instanceof Error ? e.message : String(e) } }));
    }
  }

  override render(): unknown {
    if (this.noToolbar) {
      return html`<div class="surface" dir=${this._dir}>${this._renderZoomWrap()}</div>`;
    }
    const disabled = this._phase !== 'ready';
    const items = (this.actions ?? VIEWER_DEFAULT_ACTIONS).filter((a) => a in VIEWER_ACTION_KIND);
    return html`
      <div class="toolbar" role="toolbar">
        ${this._renderViewToolbarControls(disabled)}
        ${this.hideViewControls ? nothing : html`<span class="toolbar-sep" role="separator" aria-hidden="true"></span>`}
        ${items.map((a) => {
          const label = t(this._locale, a === 'csv' ? 'excel' : a);
          return html`<button
            type="button"
            data-action=${a}
            aria-label=${label}
            title=${label}
            ?disabled=${disabled}
            @click=${() => this.exportTo(VIEWER_ACTION_KIND[a])}
          >${icon(a)}<span class="label">${label}</span></button>`;
        })}
        <span class="toolbar-spacer" aria-hidden="true"></span>
        <span class="status ${this._phase === 'error' ? 'error' : ''}">
          ${this._phase === 'loading' ? t(this._locale, 'loading') : ''}
          ${this._phase === 'error' ? `${t(this._locale, 'error')}: ${this._error}` : ''}
        </span>
      </div>
      <div class="surface" dir=${this._dir}>${this._renderZoomWrap()}</div>
    `;
  }
}

installDirOverride(ReportsViewerElement.prototype);

if (typeof customElements !== 'undefined' && !customElements.get('reports-viewer')) {
  customElements.define('reports-viewer', ReportsViewerElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'reports-viewer': ReportsViewerElement;
  }
}
