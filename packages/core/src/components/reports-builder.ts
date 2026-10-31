import { LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { FieldMeta, Row } from '@reports-web/shared';
import { logger, validateReport } from './builder/api.js';
import type { DataAdapter, ReportSchemaV1, StorageAdapter } from './builder/api.js';
import { installDirOverride, resolveDir, resolveLocale } from './direction.js';
import { emptySchema } from './builder/factory.js';
import { DndController } from './builder/interactions/dnd.js';
import { KeyboardController } from './builder/interactions/keyboard.js';
import { PointerController } from './builder/interactions/pointer.js';
import { loadFields } from './builder/ops/io.js';
import { replaceSchema } from './builder/ops/commands.js';
import type { ElementClipboard } from './builder/ops/clipboard.js';
import { renderBuilder } from './builder/render/shell.js';
import type { BuilderSession } from './builder/session.js';
import { HistoryStore } from './builder/state/history.js';
import { builderStyles } from './builder/styles/index.js';
import {
  BUILDER_DEFAULT_ACTIONS,
  type BandKey,
  type BuilderAction,
  type ContextMenuState,
  type MarqueeState,
  type SideSectionKey,
} from './builder/types.js';
import { buildViewModel } from './builder/view-model.js';

export class ReportsBuilderElement extends LitElement {
  static override styles = builderStyles;

  @property({ attribute: false }) schema: ReportSchemaV1 | null = null;
  @property({ attribute: false }) dataAdapter: DataAdapter | null = null;
  @property({ attribute: false }) storageAdapter: StorageAdapter | null = null;
  @property({ attribute: false }) sampleRows: readonly Row[] | null = null;
  /** UI language override. When unset, follows the template's meta.locale. */
  @property({ type: String }) locale: 'ar' | 'en' | undefined = undefined;
  /** Optional host override, set via the `dir` attribute or property. Empty means "follow the template". */
  @property({ type: String, attribute: 'dir' }) dirOverride: '' | 'rtl' | 'ltr' = '';
  @property({ attribute: false }) actions: readonly BuilderAction[] = BUILDER_DEFAULT_ACTIONS;

  @state() private _schema: ReportSchemaV1 = emptySchema();
  @state() private _selectedIds: ReadonlySet<string> = new Set();
  @state() private _selectedBand: BandKey | null = null;
  /** Anchor for Shift+click range selection (element id). */
  @state() private _selectionAnchorId: string | null = null;
  @state() private _fields: readonly FieldMeta[] = [];
  @state() private _hoverBand: BandKey | null = null;
  @state() private _marquee: MarqueeState | null = null;
  @state() private _leftCollapsed = false;
  @state() private _menuOpen = false;
  @state() private _historyVersion = 0;
  @state() private _zoom = 1;
  @state() private _collapsedSections: Record<SideSectionKey, boolean> = {
    actions: false,
    tools: false,
    properties: false,
  };
  @state() private _contextMenu: ContextMenuState | null = null;

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

  private get _uiLocale(): 'ar' | 'en' {
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
    if (changed.has('_leftCollapsed')) this.setAttribute('data-left-collapsed', String(this._leftCollapsed));
  }

  override render(): unknown {
    const view = buildViewModel(this.session, { pointer: this.pointer, dnd: this.dnd });
    return renderBuilder(view.state, view.cb);
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
    const el = this;
    return {
      get schema() {
        return el._schema;
      },
      set schema(v) {
        el._schema = v;
      },
      get selectedIds() {
        return el._selectedIds;
      },
      set selectedIds(v) {
        el._selectedIds = v;
      },
      get selectedBand() {
        return el._selectedBand;
      },
      set selectedBand(v) {
        el._selectedBand = v;
      },
      get selectionAnchorId() {
        return el._selectionAnchorId;
      },
      set selectionAnchorId(v) {
        el._selectionAnchorId = v;
      },
      get fields() {
        return el._fields;
      },
      set fields(v) {
        el._fields = v;
      },
      get hoverBand() {
        return el._hoverBand;
      },
      set hoverBand(v) {
        el._hoverBand = v;
      },
      get marquee() {
        return el._marquee;
      },
      set marquee(v) {
        el._marquee = v;
      },
      get leftCollapsed() {
        return el._leftCollapsed;
      },
      set leftCollapsed(v) {
        el._leftCollapsed = v;
      },
      get menuOpen() {
        return el._menuOpen;
      },
      set menuOpen(v) {
        el._menuOpen = v;
      },
      get zoom() {
        return el._zoom;
      },
      set zoom(v) {
        el._zoom = v;
      },
      get collapsedSections() {
        return el._collapsedSections;
      },
      set collapsedSections(v) {
        el._collapsedSections = v;
      },
      get contextMenu() {
        return el._contextMenu;
      },
      set contextMenu(v) {
        el._contextMenu = v;
      },
      get actions() {
        return el.actions;
      },
      set actions(v) {
        el.actions = v;
      },
      get clipboard() {
        return el._clipboard;
      },
      set clipboard(v) {
        el._clipboard = v;
      },
      get uiLocale() {
        return el._uiLocale;
      },
      get uiDir() {
        return el._uiDir;
      },
      get canvasDir() {
        return el._canvasDir;
      },
      get dataAdapter() {
        return el.dataAdapter;
      },
      get storageAdapter() {
        return el.storageAdapter;
      },
      get sampleRows() {
        return el.sampleRows;
      },
      get history() {
        return el._history;
      },
      get shadowRoot() {
        return el.shadowRoot;
      },
      touchHistory() {
        el._historyVersion++;
      },
      focus() {
        el.focus();
      },
      dispatchEvent(event: Event) {
        return el.dispatchEvent(event);
      },
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
