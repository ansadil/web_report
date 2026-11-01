import { LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { FieldMeta, LocaleTag, Row } from '@reports-web/shared';
import {
  BUILDER_DEFAULT_ACTIONS,
  DndController,
  HistoryStore,
  KeyboardController,
  PointerController,
  builderStyles,
  buildViewModel,
  emptySchema,
  loadFields,
  formatCursorMm,
  logger,
  renderBuilder,
  replaceSchema,
  validateReport,
} from './builder/index.js';
import type {
  BandKey,
  BuilderAction,
  BuilderSession,
  ContextMenuState,
  DataAdapter,
  ElementClipboard,
  MarqueeState,
  RibbonTab,
  ReportSchemaV1,
  SideSectionKey,
  SideTab,
  StorageAdapter,
} from './builder/index.js';
import { installDirOverride, resolveDir, resolveLocale } from './direction.js';
import { DEFAULT_FONTS_BASE_URL } from '../exporters/fonts-manifest.js';
import { ensureReportFonts } from './web-fonts.js';

export class ReportsBuilderElement extends LitElement {
  static override styles = builderStyles;

  @property({ attribute: false }) schema: ReportSchemaV1 | null = null;
  @property({ attribute: false }) dataAdapter: DataAdapter | null = null;
  @property({ attribute: false }) storageAdapter: StorageAdapter | null = null;
  @property({ attribute: false }) sampleRows: readonly Row[] | null = null;
  /** UI language override (BCP 47 tag). When unset, follows the template's meta.locale. */
  @property({ type: String }) locale: LocaleTag | undefined = undefined;
  /** Optional host override, set via the `dir` attribute or property. Empty means "follow the template". */
  @property({ type: String, attribute: 'dir' }) dirOverride: '' | 'rtl' | 'ltr' = '';
  @property({ attribute: false }) actions: readonly BuilderAction[] = BUILDER_DEFAULT_ACTIONS;
  /** Folder of fonts.json and the woff2 faces. Default: the bundled assets/fonts directory. */
  @property({ type: String, attribute: 'fonts-base-url' }) fontsBaseUrl = DEFAULT_FONTS_BASE_URL;
  /** When set, the canvas and side panels yield to the slotted preview (title, ribbon, and status stay). */
  @property({ type: Boolean, reflect: true }) previewing = false;

  @state() private _schema: ReportSchemaV1 = emptySchema();
  @state() private _selectedIds: ReadonlySet<string> = new Set();
  @state() private _selectedBand: BandKey | null = null;
  /** Anchor for Shift+click range selection (element id). */
  @state() private _selectionAnchorId: string | null = null;
  @state() private _fields: readonly FieldMeta[] = [];
  @state() private _hoverBand: BandKey | null = null;
  @state() private _marquee: MarqueeState | null = null;
  @state() private _leftCollapsed = false;
  @state() private _sideTab: SideTab = 'dictionary';
  @state() private _menuOpen = false;
  @state() private _historyVersion = 0;
  @state() private _zoom = 1;
  @state() private _collapsedSections: Record<SideSectionKey, boolean> = {
    actions: false,
    tools: false,
    properties: false,
    dictionary: false,
    reportTree: false,
  };
  @state() private _contextMenu: ContextMenuState | null = null;
  @state() private _ribbonTab: RibbonTab = 'home';
  /** Painted into the status bar directly so a pointer move does not re-render the designer. */
  private _cursorMm: { x: number; y: number } | null = null;
  private _cursorFrame = 0;

  private _clipboard: ElementClipboard | null = null;
  private readonly _history = new HistoryStore(() => {
    this._historyVersion++;
  });
  private _syncingDir = false;
  private readonly session: BuilderSession = this.createSession();
  private readonly pointer = new PointerController(this.session, this);
  private readonly dnd = new DndController(this.session, this);
  private readonly keyboard = new KeyboardController(this.session, this);

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

  private get _uiLocale(): LocaleTag {
    return resolveLocale(this.locale, this._schema.meta);
  }

  private get _uiDir(): 'rtl' | 'ltr' {
    return resolveDir(this.dirOverride, this._schema.meta, this._uiLocale);
  }

  /** Direction of the report canvas: always the template's own. */
  private get _canvasDir(): 'rtl' | 'ltr' {
    return this._schema.meta.dir;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (this.schema) replaceSchema(this.session, structuredClone(this.schema), { resetHistory: true });
    void loadFields(this.session);
    void ensureReportFonts(this._schema, this.fontsBaseUrl);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  override updated(changed: Map<PropertyKey, unknown>): void {
    this._syncHostDir(this._uiDir);
    let schemaChanged = false;
    if (changed.has('schema') && this.schema) {
      const v = validateReport(this.schema);
      if (v.ok) {
        replaceSchema(this.session, v.value, { resetHistory: true });
        schemaChanged = true;
      } else {
        logger.error('reports-builder', 'invalid initial schema', { error: v.error });
      }
    }
    if (changed.has('dataAdapter') || schemaChanged) void loadFields(this.session);
    if (changed.has('fontsBaseUrl') || schemaChanged) void ensureReportFonts(this._schema, this.fontsBaseUrl);
    if (changed.has('_leftCollapsed')) this.setAttribute('data-left-collapsed', String(this._leftCollapsed));
    this._paintCursor();
  }

  private _paintCursor(): void {
    const node = this.renderRoot.querySelector('[data-testid="status-cursor-value"]');
    if (!node) return;
    node.textContent = formatCursorMm(this._cursorMm, {
      locale: this._uiLocale,
      digits: this._schema.meta.pageNumberDigits ?? 'locale',
    });
  }

  private _queueCursor(point: { x: number; y: number } | null): void {
    this._cursorMm = point;
    if (this._cursorFrame) return;
    const raf = globalThis.requestAnimationFrame?.bind(globalThis);
    if (!raf) {
      this._paintCursor();
      return;
    }
    this._cursorFrame = raf(() => {
      this._cursorFrame = 0;
      this._paintCursor();
    });
  }

  override render(): unknown {
    const view = buildViewModel(this.session, { pointer: this.pointer, dnd: this.dnd });
    view.cb.onToggleLocale = () => this.toggleUiLocale();
    view.cb.onSetLocale = (locale) => this.setUiLocale(locale);
    const openSamples = () => this.dispatchEvent(new CustomEvent('toggle-samples', { bubbles: true, composed: true }));
    view.cb.onSamples = openSamples;
    view.cb.ribbon.onSamples = openSamples;
    return renderBuilder(view.state, view.cb);
  }

  private toggleUiLocale(): void {
    this.setUiLocale(this._uiLocale.toLowerCase().startsWith('ar') ? 'en' : 'ar');
  }

  private setUiLocale(locale: 'ar' | 'en'): void {
    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    this.locale = locale;
    this.dir = dir;
    this.dispatchEvent(new CustomEvent('locale-change', { bubbles: true, composed: true, detail: { locale, dir } }));
  }

  getSchema(): ReportSchemaV1 {
    return structuredClone(this._schema);
  }

  setSchema(schema: ReportSchemaV1): void {
    const v = validateReport(schema);
    if (!v.ok) throw new Error(v.error);
    replaceSchema(this.session, v.value, { resetHistory: true });
  }

  private createSession(): BuilderSession {
    const schema = () => this._schema;
    const setSchemaValue = (v: ReportSchemaV1) => {
      this._schema = v;
    };
    const selectedIds = () => this._selectedIds;
    const setSelectedIds = (v: ReadonlySet<string>) => {
      this._selectedIds = v;
    };
    const selectedBand = () => this._selectedBand;
    const setSelectedBand = (v: BandKey | null) => {
      this._selectedBand = v;
    };
    const selectionAnchorId = () => this._selectionAnchorId;
    const setSelectionAnchorId = (v: string | null) => {
      this._selectionAnchorId = v;
    };
    const fields = () => this._fields;
    const setFields = (v: readonly FieldMeta[]) => {
      this._fields = v;
    };
    const hoverBand = () => this._hoverBand;
    const setHoverBand = (v: BandKey | null) => {
      this._hoverBand = v;
    };
    const marquee = () => this._marquee;
    const setMarquee = (v: MarqueeState | null) => {
      this._marquee = v;
    };
    const leftCollapsed = () => this._leftCollapsed;
    const setLeftCollapsed = (v: boolean) => {
      this._leftCollapsed = v;
    };
    const sideTab = () => this._sideTab;
    const setSideTabValue = (v: SideTab) => {
      this._sideTab = v;
    };
    const menuOpen = () => this._menuOpen;
    const setMenuOpen = (v: boolean) => {
      this._menuOpen = v;
    };
    const zoom = () => this._zoom;
    const setZoomValue = (v: number) => {
      this._zoom = v;
    };
    const collapsedSections = () => this._collapsedSections;
    const setCollapsedSections = (v: Record<SideSectionKey, boolean>) => {
      this._collapsedSections = v;
    };
    const contextMenu = () => this._contextMenu;
    const setContextMenu = (v: ContextMenuState | null) => {
      this._contextMenu = v;
    };
    const ribbonTab = () => this._ribbonTab;
    const setRibbonTab = (v: RibbonTab) => {
      this._ribbonTab = v;
    };
    const cursorMm = () => this._cursorMm;
    const setCursorMm = (v: { x: number; y: number } | null) => {
      this._queueCursor(v);
    };
    const actions = () => this.actions;
    const setActions = (v: readonly BuilderAction[]) => {
      this.actions = v;
    };
    const clipboard = () => this._clipboard;
    const setClipboard = (v: ElementClipboard | null) => {
      this._clipboard = v;
    };
    const uiLocale = () => this._uiLocale;
    const uiDir = () => this._uiDir;
    const canvasDir = () => this._canvasDir;
    const dataAdapter = () => this.dataAdapter;
    const storageAdapter = () => this.storageAdapter;
    const sampleRows = () => this.sampleRows;
    const history = () => this._history;
    const shadowRoot = () => this.shadowRoot;
    const touchHistory = () => {
      this._historyVersion++;
    };
    const focus = () => {
      this.focus();
    };
    const dispatchEvent = (event: Event) => this.dispatchEvent(event);
    return {
      get schema() {
        return schema();
      },
      set schema(v) {
        setSchemaValue(v);
      },
      get selectedIds() {
        return selectedIds();
      },
      set selectedIds(v) {
        setSelectedIds(v);
      },
      get selectedBand() {
        return selectedBand();
      },
      set selectedBand(v) {
        setSelectedBand(v);
      },
      get selectionAnchorId() {
        return selectionAnchorId();
      },
      set selectionAnchorId(v) {
        setSelectionAnchorId(v);
      },
      get fields() {
        return fields();
      },
      set fields(v) {
        setFields(v);
      },
      get hoverBand() {
        return hoverBand();
      },
      set hoverBand(v) {
        setHoverBand(v);
      },
      get marquee() {
        return marquee();
      },
      set marquee(v) {
        setMarquee(v);
      },
      get leftCollapsed() {
        return leftCollapsed();
      },
      set leftCollapsed(v) {
        setLeftCollapsed(v);
      },
      get sideTab() {
        return sideTab();
      },
      set sideTab(v) {
        setSideTabValue(v);
      },
      get menuOpen() {
        return menuOpen();
      },
      set menuOpen(v) {
        setMenuOpen(v);
      },
      get zoom() {
        return zoom();
      },
      set zoom(v) {
        setZoomValue(v);
      },
      get collapsedSections() {
        return collapsedSections();
      },
      set collapsedSections(v) {
        setCollapsedSections(v);
      },
      get contextMenu() {
        return contextMenu();
      },
      set contextMenu(v) {
        setContextMenu(v);
      },
      get ribbonTab() {
        return ribbonTab();
      },
      set ribbonTab(v) {
        setRibbonTab(v);
      },
      get cursorMm() {
        return cursorMm();
      },
      set cursorMm(v) {
        setCursorMm(v);
      },
      get actions() {
        return actions();
      },
      set actions(v) {
        setActions(v);
      },
      get clipboard() {
        return clipboard();
      },
      set clipboard(v) {
        setClipboard(v);
      },
      get uiLocale() {
        return uiLocale();
      },
      get uiDir() {
        return uiDir();
      },
      get canvasDir() {
        return canvasDir();
      },
      get dataAdapter() {
        return dataAdapter();
      },
      get storageAdapter() {
        return storageAdapter();
      },
      get sampleRows() {
        return sampleRows();
      },
      get history() {
        return history();
      },
      get shadowRoot() {
        return shadowRoot();
      },
      touchHistory,
      focus,
      dispatchEvent,
    };
  }
}

installDirOverride(ReportsBuilderElement.prototype);

if (typeof customElements !== 'undefined' && !customElements.get('reports-builder')) {
  customElements.define('reports-builder', ReportsBuilderElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'reports-builder': ReportsBuilderElement;
  }
}
