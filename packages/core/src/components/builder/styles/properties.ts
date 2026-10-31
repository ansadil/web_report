import { css } from 'lit';

export const propertiesStyles = css`
    .prop-grid { display: flex; flex-direction: column; min-width: 0; }
    .prop-card { display: flex; align-items: center; gap: 8px; margin: 0 10px 6px; border: 1px solid var(--rb-border); border-radius: 7px; padding: 5px 8px; background: #f7f9fc; }
    .prop-card b { display: block; font-size: 12.5px; }
    .prop-card small { color: var(--rb-muted); }
    .prop-card-icon { width: 26px; height: 26px; border-radius: 6px; background: #fff3ea; color: #f0752a; display: grid; place-items: center; border: 1px solid #fbd5bb; flex: none; font-weight: 700; }
    .ptoggle { display: flex; gap: 4px; margin: 0 10px 6px; }
    .ptoggle button { flex: 1; border: 1px solid var(--rb-border); background: #fff; border-radius: 6px; height: 26px; cursor: pointer; color: #4a5568; }
    .ptoggle button.on { background: #e7f0fb; border-color: #b9d2f1; color: #1f5fa8; font-weight: 600; }
    .prop-tools { display: flex; justify-content: flex-end; gap: 4px; margin: 0 10px 6px; }
    .prop-tools button { border: 1px solid var(--rb-border); background: #fff; border-radius: 6px; height: 24px; padding: 0 8px; cursor: pointer; color: #4a5568; font: inherit; font-size: 11px; }
    .prop-tools button.on { background: #e7f0fb; border-color: #b9d2f1; color: #1f5fa8; font-weight: 600; }
    .prop-search { margin: 0 10px 6px; }
    .prop-search input { width: 100%; height: 30px; border: 1px solid var(--rb-border); border-radius: 7px; padding: 0 8px; }
    .cat { border-top: 1px solid var(--rb-border); }
    .cat-h { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #f7f9fc; font-weight: 700; font-size: 12px; }
    .cat-h .cnt { margin-inline-start: auto; color: var(--rb-muted); font-weight: 500; font-size: 10.5px; }
    .prow { display: grid; grid-template-columns: minmax(0, 42%) minmax(0, 1fr); border-top: 1px solid #eef1f6; min-height: 27px; }
    .prow .k { padding: 4px 10px; color: #4a5568; border-inline-end: 1px solid #eef1f6; display: flex; align-items: center; min-width: 0; overflow: hidden; }
    .prow .v { position: relative; padding: 2px 6px; display: flex; align-items: center; gap: 5px; min-width: 0; width: 100%; }
    .prow .v input, .prow .v select {
      width: 100%; min-width: 0; border: 1px solid transparent; background: transparent; height: 24px;
      font: inherit; font-size: 12px; color: inherit; text-overflow: ellipsis;
    }
    .prow .v select.pick, .prow .v select {
      appearance: none; padding-inline: 2px 18px; padding-block: 0; cursor: pointer; width: 100%;
      /* Content box is 24px inside the 1px border; a taller line-height clips the closed value. */
      height: 26px; min-height: 26px; line-height: 22px; box-sizing: border-box;
      background-image: linear-gradient(45deg, transparent 50%, #64748b 50%), linear-gradient(135deg, #64748b 50%, transparent 50%);
      background-position: calc(100% - 10px) 11px, calc(100% - 6px) 11px;
      background-size: 4px 4px, 4px 4px;
      background-repeat: no-repeat;
    }
    .color-value { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
    .color-value .swatch { width: 16px; height: 16px; padding: 0; border: 1px solid rgba(0,0,0,.15); border-radius: 4px; flex: none; background: transparent; }
    .color-value .hex { flex: 1; min-width: 0; font-family: ui-monospace, Consolas, monospace; direction: ltr; text-align: start; }
    .prow .name-value { direction: ltr; text-align: start; }
    .pick { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
    .pick-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-inline-end: 14px; }
    .pick select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
    .pick::after {
      content: ''; position: absolute; inset-inline-end: 4px; top: 9px; width: 0; height: 0;
      border-inline-start: 4px solid transparent; border-inline-end: 4px solid transparent; border-top: 5px solid #64748b;
    }
    :host([dir='rtl']) .prow .v select {
      background-position: 10px 10px, 6px 10px;
    }
    .prow .u { color: var(--rb-muted); font-size: 10.5px; }
    .prop-grid .events-body { display: none; padding: 12px; color: var(--rb-muted); }
    .prop-grid.show-events .props-body { display: none; }
    .prop-grid.show-events .events-body { display: block; }
    .props {
      display: grid;
      gap: 8px;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    .props label { display: grid; gap: 4px; font-size: 11px; color: #475569; min-width: 0; }
    .props input, .props select, .props textarea {
      padding: 4px 6px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .props textarea {
      min-height: 120px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .props .hint {
      margin: 0;
      font-size: 11px;
      color: #64748b;
      line-height: 1.35;
    }
    .props .field-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .props .field-chips .chip {
      padding: 2px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #f8fafc;
      font-size: 11px;
      cursor: pointer;
    }
    .props .field-chips .chip:hover {
      background: #e2e8f0;
    }
    .props input[type='checkbox'],
    .props input[type='color'] {
      width: auto;
      max-width: none;
      justify-self: start;
    }
    .props label:has(input[type='checkbox']) {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 8px;
      flex-wrap: wrap;
    }
    .props label:has(input[type='checkbox']) input[type='checkbox'] {
      margin-top: 2px;
      flex: none;
    }
    .props .grid2,
    .props .grid4 {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      min-width: 0;
    }
    .props button.danger {
      background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; padding: 6px;
      border-radius: 4px; cursor: pointer;
    }
    .props button.secondary {
      background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 4px 8px;
      border-radius: 4px; cursor: pointer; font-size: 11px;
    }
    .empty-hint { color: #94a3b8; text-align: center; padding: 16px; font-style: italic; }
    .group {
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 8px;
      background: var(--rb-tool-bg);
      min-width: 0;
      box-sizing: border-box;
    }
    .group > h4 {
      font-size: 11px;
      text-transform: uppercase;
      color: var(--rb-muted);
      letter-spacing: 0.5px;
      margin: 0 0 8px;
      font-weight: 600;
    }
    .cond-rule {
      background: #fff;
      border: 1px solid var(--rb-border);
      border-radius: 4px;
      padding: 6px;
      margin-bottom: 6px;
      display: grid;
      gap: 4px;
    }
    .cond-rule .row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }
    .cond-rule input { flex: 1 1 120px; min-width: 0; max-width: 100%; }
    .sub-panel {
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 8px;
      background: rgba(255,255,255,0.65);
      min-width: 0;
      box-sizing: border-box;
    }
    .sub-panel h5 {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--rb-text);
    }
    .nested-band {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed var(--rb-border);
    }
    .nested-band h6 {
      margin: 0 0 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--rb-muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .props .band-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  
`;
