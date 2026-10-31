import type { FieldMeta, Row } from '@reports-web/shared';
import type { DataAdapter, ReportSchemaV1, StorageAdapter } from './api.js';
import type { ElementClipboard } from './ops/clipboard.js';
import type { HistoryStore } from './state/history.js';
import type { BandKey, BuilderAction, ContextMenuState, MarqueeState, SideSectionKey } from './types.js';

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
  menuOpen: boolean;
  zoom: number;
  collapsedSections: Record<SideSectionKey, boolean>;
  contextMenu: ContextMenuState | null;
  actions: readonly BuilderAction[];
  clipboard: ElementClipboard | null;

  readonly uiLocale: 'ar' | 'en';
  readonly uiDir: 'rtl' | 'ltr';
  readonly canvasDir: 'rtl' | 'ltr';
  readonly dataAdapter: DataAdapter | null;
  readonly storageAdapter: StorageAdapter | null;
  readonly sampleRows: readonly Row[] | null;
  readonly history: HistoryStore;
  readonly shadowRoot: ShadowRoot | null;

  touchHistory(): void;
  focus(): void;
  dispatchEvent(event: Event): boolean;
}
