import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { FieldMeta } from '@reports-web/shared';
import { createElement } from '../factory.js';
import { bandBounds, clampElementPos, pointInBand } from '../geometry.js';
import { applySelection, updateBand, updateElement } from '../ops/commands.js';
import type { BuilderSession } from '../session.js';
import { selectOnly } from '../state/selection.js';
import type { BandKey, ToolKind } from '../types.js';

export class DndController implements ReactiveController {
  constructor(
    private readonly session: BuilderSession,
    host: ReactiveControllerHost,
  ) {
    host.addController(this);
  }

  hostConnected(): void {}

  hostDisconnected(): void {}

  onToolDragStart(ev: DragEvent, kind: ToolKind): void {
    ev.dataTransfer?.setData('application/x-rw-tool', JSON.stringify({ kind }));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }

  onFieldDragStart(ev: DragEvent, field: FieldMeta): void {
    ev.dataTransfer?.setData('application/x-rw-field', JSON.stringify({ name: field.name, type: field.type }));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }

  onBandDragOver(ev: DragEvent, band: BandKey): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    this.session.hoverBand = band;
  }

  onBandDragLeave(): void {
    this.session.hoverBand = null;
  }

  onBandDrop(ev: DragEvent, band: BandKey): void {
    ev.preventDefault();
    this.session.hoverBand = null;
    const dt = ev.dataTransfer;
    if (!dt) return;
    const target = ev.currentTarget as HTMLElement;
    const bounds = bandBounds(this.session.schema, band);
    const point = pointInBand(ev, target.getBoundingClientRect(), {
      rtl: this.session.canvasDir === 'rtl',
      zoom: this.session.zoom,
      maxW: bounds.maxW,
      maxH: bounds.maxH,
    });
    const toolRaw = dt.getData('application/x-rw-tool');
    const fieldRaw = dt.getData('application/x-rw-field');
    let created: ReturnType<typeof createElement> | null = null;
    if (toolRaw) {
      const { kind } = JSON.parse(toolRaw) as { kind: ToolKind };
      created = createElement(kind, point.x - 15, point.y - 3, 30, 6);
    } else if (fieldRaw) {
      const { name } = JSON.parse(fieldRaw) as { name: string };
      if (this.session.selectedBand === band && this.session.selectedIds.size === 1) {
        const selectedId = [...this.session.selectedIds][0]!;
        const selected = this.session.schema.bands[band]?.elements.find((e) => e.id === selectedId);
        if (selected && selected.kind === 'richtext') {
          updateElement(this.session, band, selectedId, { content: `${selected.content}<${name}>` });
          return;
        }
      }
      created = createElement('field', point.x - 20, point.y - 3, 40, 6, name);
    }
    if (!created) return;
    const placed = { ...created, pos: clampElementPos(created.pos, bounds) };
    updateBand(this.session, band, (b) => ({ ...b, elements: [...b.elements, placed] }));
    applySelection(this.session, selectOnly(band, placed.id));
  }
}
