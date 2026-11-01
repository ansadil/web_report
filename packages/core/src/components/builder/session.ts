import type { FieldMeta, LocaleTag, Row } from '@reports-web/shared';
import type { DataAdapter, ReportSchemaV1, StorageAdapter } from './api.js';
import type { ElementClipboard } from './ops/clipboard.js';
import type { HistoryStore } from './state/history.js';
import type { BandKey, BuilderAction, ContextMenuState, MarqueeState, RibbonTab, SideSectionKey, SideTab } from './types.js';

/** Mutable builder state. Render modules never see this object. */
export interface BuilderSession {
  schema: ReportSchemaV1;
  selectedIds: ReadonlySet<string>;
  selectedBand: BandKey | null;
  selectionAnchorId: string | null;
  fields: readonly FieldMeta[];
  hoverBand: BandKey | null;
  marquee: MarqueeState | null;
  leftCollapsed: boolean;
  sideTab: SideTab;
  menuOpen: boolean;
  zoom: number;
  collapsedSections: Record<SideSectionKey, boolean>;
  contextMenu: ContextMenuState | null;
  actions: readonly BuilderAction[];
  ribbonTab: RibbonTab;
  cursorMm: { x: number; y: number } | null;
  clipboard: ElementClipboard | null;

  readonly uiLocale: LocaleTag;
  readonly uiDir: 'rtl' | 'ltr';
  readonly canvasDir: 'rtl' | 'ltr';
  readonly dataAdapter: DataAdapter | null;
  readonly storageAdapter: StorageAdapter | null;
  readonly sampleRows: readonly Row[] | null;
  readonly history: HistoryStore;
  readonly shadowRoot: ShadowRoot | null;

  marginFeedback: Partial<Record<'top' | 'right' | 'bottom' | 'left', { raw: string; error: string; kind?: 'invalid' | 'clamped'; reason?: 'nan' | 'negative' | 'width' | 'height' | 'clamped' }>>;
  setMarginFeedback(next: Partial<Record<'top' | 'right' | 'bottom' | 'left', { raw: string; error: string; kind?: 'invalid' | 'clamped'; reason?: 'nan' | 'negative' | 'width' | 'height' | 'clamped' }>>): void;
  marginNotice: string;
  setMarginNotice(next: string): void;

  touchHistory(): void;
  focus(): void;
  dispatchEvent(event: Event): boolean;
}
