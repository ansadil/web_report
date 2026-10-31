import { css } from 'lit';
import { BAND_HEAD_PX } from '../metrics.js';

export const chromeStyles = css`
  .ribbon-host, .status-host { display: contents; }
  .ribbon { grid-area: ribbon; background: var(--rb-panel); border-bottom: 1px solid var(--rb-border); min-width: 0; }
  .ribbon-tabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid var(--rb-border); background: #f8fafc; }
  .ribbon-tab {
    border: 0; background: transparent; padding: 6px 12px; cursor: pointer; color: var(--rb-muted);
    font: inherit; font-weight: 600; border-bottom: 2px solid transparent;
  }
  .ribbon-tab.active { color: var(--rb-accent); border-bottom-color: var(--rb-accent); background: #fff; }
  .ribbon-tab:focus-visible { outline: 2px solid var(--rb-accent); outline-offset: -2px; }
  .ribbon-body { display: flex; align-items: center; gap: 8px; padding: 6px 8px; min-height: 52px; overflow: auto; }
  .ribbon-pane { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  #ribbon-panel-home { flex-wrap: nowrap; }
  #ribbon-panel-home .toolbar { flex-wrap: nowrap; }
  #ribbon-panel-home .doc-name { width: 120px; margin: 0; }
  .ribbon-pane[hidden] { display: none; }
  .ribbon-group, .ribbon-insert { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  #ribbon-panel-home .ribbon-group { flex-wrap: nowrap; }
  .ribbon-cluster { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .ribbon-caption { font-size: 10px; color: var(--rb-muted); line-height: 1.2; }
  .ribbon-file { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0; }
  .ribbon-group select, .ribbon-group input[data-testid='ribbon-font-size'] {
    font: inherit; font-size: 12px; border: 1px solid var(--rb-border); border-radius: 6px; padding: 4px 6px; background: var(--rb-panel);
  }
  .ribbon-group select { max-width: 108px; }
  .ribbon-group input[data-testid='ribbon-font-size'] { width: 44px; }
  .ribbon-cmd.icon-only { padding: 4px; }
  :host([dir='rtl']) [data-testid='ribbon-align-start'] svg,
  :host([dir='rtl']) [data-testid='ribbon-align-end'] svg { transform: scaleX(-1); }
  .ribbon-group input[type='color'] { width: 28px; height: 28px; padding: 0; border: 1px solid var(--rb-border); background: transparent; }
  .ribbon-cmd, .ribbon-insert-btn {
    display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--rb-border);
    background: var(--rb-panel); border-radius: 6px; padding: 4px 8px; cursor: pointer; font: inherit; font-size: 12px;
  }
  .ribbon-cmd:disabled { opacity: 0.45; cursor: not-allowed; }
  .ribbon-tab.file { background: #1f5fa8; color: #fff; border-radius: 6px; margin-bottom: 4px; }
  .ribbon-tab.file.active { color: #fff; border-bottom-color: transparent; background: #1f5fa8; }
  .ribbon-tab.preview-tab { color: #0e9384; }
  .ribbon-tab.preview-tab.active { color: #0e9384; border-bottom-color: #0e9384; }
  .ribbon-body { min-height: 106px; align-items: stretch; }
  .ribbon-cluster { border-inline-start: 1px solid #eef1f6; padding-inline: 8px; align-self: stretch; justify-content: space-between; }
  .ribbon-big {
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 3px;
    min-width: 52px; padding: 5px 5px 3px; border: 1px solid transparent; border-radius: 7px;
    background: none; cursor: pointer; line-height: 1.25; font-size: 11.5px; color: var(--rb-text);
  }
  .ribbon-big .ic { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; }
  .ribbon-big .ic svg { width: 28px; height: 28px; }
  .color-swatch { position: relative; width: 26px; height: 26px; display: grid; place-items: end center; cursor: pointer; }
  .color-swatch .bar { width: 16px; height: 4px; border-radius: 2px; }
  .color-swatch input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .ribbon-big.c-blue .ic { background: #e6f0fc; color: #1f5fa8; }
  .ribbon-big.c-teal .ic { background: #e0f5f1; color: #0e8173; }
  .ribbon-big.c-amber .ic { background: #fdf1dc; color: #b86b06; }
  .ribbon-big.c-violet .ic { background: #efeafd; color: #6740c9; }
  .ribbon-big.c-slate .ic { background: #edf0f5; color: #475569; }
  .ribbon-big:disabled { opacity: 0.45; cursor: not-allowed; }
  .ribbon-smallcol { display: flex; flex-direction: column; gap: 2px; }
  .ribbon-fontcol { display: flex; flex-direction: column; gap: 4px; }
  .ribbon .row { display: flex; gap: 3px; align-items: center; }
  .titlebar {
    height: 34px; max-height: 34px; overflow: hidden; background: #fff; color: #1b2433;
    display: flex; align-items: center; gap: 12px; padding: 0 10px; min-width: 0; z-index: 3;
    border-bottom: 1px solid #dfe4ec;
  }
  .titlebar .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; white-space: nowrap; flex: none; }
  .titlebar .brand .product { font-weight: 500; color: #4a5568; }
  .titlebar .qa { display: flex; gap: 2px; flex: none; }
  .titlebar .qa-btn {
    width: 26px; height: 26px; border: 0; border-radius: 5px; background: transparent; color: #334155;
    display: grid; place-items: center; padding: 0; cursor: pointer;
  }
  .titlebar .qa-btn:disabled { opacity: 0.35; cursor: default; }
  .titlebar .doc-center { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .titlebar .doc-center input {
    width: min(280px, 46%); border: 0; background: transparent; color: #1b2433; text-align: center; font: inherit; font-weight: 600;
  }
  .titlebar .saved { color: #7a8699; font-size: 12px; white-space: nowrap; }
  .titlebar .tb-end { display: flex; align-items: center; gap: 8px; color: #4a5568; font-size: 11.5px; white-space: nowrap; flex: none; }
  .titlebar .avatar { width: 24px; height: 24px; border-radius: 50%; background: #e7f0fb; color: #1f5fa8; display: grid; place-items: center; }
  .status-spacer { flex: 1; }
  .status-bar .toolbar { background: transparent; padding: 0; gap: 4px; flex: none; }
  .status-bar .zoom input[type='range'] { width: 110px; accent-color: #1f5fa8; }
  .page-tabs {
    display: flex; align-items: flex-end; gap: 2px; padding: 0 10px; background: #f3f5f8; border-top: 1px solid #dfe4ec;
  }
  .page-tab {
    border: 1px solid #dfe4ec; border-bottom: 0; background: #e9edf3; border-radius: 6px 6px 0 0;
    padding: 3px 14px; color: #4a5568; cursor: pointer;
  }
  .page-tab.on { background: #fff; color: #1f5fa8; font-weight: 700; }
  .dict { padding: 4px 8px 8px; }
  .dict-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 0; }
  .dict details { margin: 0; }
  .dict summary { list-style: none; cursor: pointer; }
  .dict summary::-webkit-details-marker { display: none; }
  .dict-node { display: flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 4px; border-radius: 5px; }
  .dict-node svg { width: 14px; height: 14px; flex: none; }
  .dict-tools { display: flex; gap: 2px; justify-content: flex-end; padding: 4px 8px; }
  .dict-tools .qa-btn { width: 24px; height: 24px; border: 0; background: transparent; color: #1f5fa8; display: grid; place-items: center; cursor: pointer; }
  .dict-node.cur { background: #e7f0fb; color: #174a85; font-weight: 600; }
  .tmeta { margin-inline-start: auto; color: #7a8699; font-size: 10.5px; background: #f4f6fa; border-radius: 8px; padding: 0 6px; font-weight: 500; }
  .dict-node.root { font-weight: 700; margin-top: 6px; }
  .dict-node.source, .dict-node.field { padding-inline-start: 18px; }
  .tic { width: 18px; height: 18px; border-radius: 4px; display: grid; place-items: center; font-size: 9px; font-weight: 800; background: #fdf1dc; color: #b86b06; flex: none; }
  .tic svg { width: 12px; height: 12px; }
  .tic-string { background: #fdf1dc; color: #b86b06; }
  .tic-number { background: #e0f5f1; color: #0e8173; }
  .tic-date { background: #fde7ec; color: #c2304f; }
  .tic-bool { background: #e8ecf3; color: #334155; }
  .tic-image { background: #e6f0fc; color: #1f5fa8; }
  .tic-table { background: #e3f6e8; color: #1f8a43; }
  .tic-relation, .tic-list { background: #efeafd; color: #6740c9; }
  .tic-static { background: #e8ecf3; color: #334155; }
  .dict-hint {
    margin: 6px 10px 10px; padding: 8px 10px; border: 1px dashed #c8d6ea; border-radius: 8px; background: #f7faff; color: #4a5568; font-size: 11.5px; line-height: 1.5;
  }
  .side-tabs { display: flex; border-bottom: 1px solid #dfe4ec; background: #f7f9fc; }
  .side-tabs button {
    flex: 1; border: 0; background: none; padding: 8px 4px; cursor: pointer; font-weight: 600; color: #4a5568;
    display: flex; gap: 4px; align-items: center; justify-content: center; border-bottom: 2px solid transparent;
  }
  .side-tabs button.on { color: #1f5fa8; border-bottom-color: #1f5fa8; background: #fff; }
  aside.props {
    background: var(--rb-panel); border-inline-start: 1px solid var(--rb-border); min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column;
  }
  .ribbon-insert-btn { cursor: grab; flex-direction: column; min-width: 64px; }
  .band-strip { display: flex; flex-direction: column; }
  .band-head {
    height: ${BAND_HEAD_PX}px; display: flex; align-items: center; gap: 6px; padding-inline: 6px;
    background: #334155; color: #fff; font-size: 10px; font-weight: 700; flex: none;
  }
  .band-head svg { width: 12px; height: 12px; flex: none; }
  .band-head .band-settings { margin-inline-start: auto; border: 0; background: transparent; color: inherit; padding: 0; cursor: pointer; display: grid; }
  .band-strip[data-band='reportHeader'] .band-head { background: #6b4fc8; }
  .band-strip[data-band='reportHeader'] .band { background-color: #faf8ff; border-color: #c9bdf0; }
  .band-strip[data-band='pageHeader'] .band-head { background: #2f6fc0; }
  .band-strip[data-band='pageHeader'] .band { background-color: #f6faff; border-color: #bcd3f1; }
  .band-strip[data-band='dataHeader'] .band-head { background: #0f8a7c; }
  .band-strip[data-band='dataHeader'] .band { background-color: #f4fcfa; border-color: #b3e3db; }
  .band-strip[data-band='detail'] .band-head { background: #c47a12; }
  .band-strip[data-band='detail'] .band { background-color: #fffaf0; border-color: #efd4a6; }
  .band-strip[data-band='groupFooter'] .band-head { background: #be3a5a; }
  .band-strip[data-band='groupFooter'] .band { background-color: #fff7f9; border-color: #f1c1cd; }
  .band-strip[data-band='reportFooter'] .band-head { background: #be3a5a; }
  .band-strip[data-band='reportFooter'] .band { background-color: #fff7f9; border-color: #f1c1cd; }
  .band-strip[data-band='pageFooter'] .band-head { background: #536176; }
  .band-strip[data-band='pageFooter'] .band { background-color: #f8f9fb; border-color: #cdd4de; }
  .band-head .band-label {
    position: static; inset: auto; background: transparent; color: inherit; padding: 0; pointer-events: none;
  }
  .el-name {
    position: absolute; top: -16px; inset-inline-end: 0; z-index: 4; max-width: 100%;
    background: #f0752a; color: #fff; font-size: 10px; line-height: 16px; padding: 0 6px;
    pointer-events: none; overflow: hidden; white-space: nowrap; border-radius: 3px 3px 0 0;
  }
  .sheet {
    display: grid;
    grid-template-columns: 22px max-content;
    grid-template-rows: 22px max-content;
    width: max-content;
    margin: 8px auto;
  }
  .ruler-corner { background: #f8fafc; border: 1px solid #cbd5e1; }
  .ruler { position: relative; background: #f8fafc; border: 1px solid #cbd5e1; overflow: hidden; font-size: 9px; color: #64748b; }
  .ruler-h { height: 22px; border-inline-end: 0; }
  .ruler-v { width: 22px; border-top: 0; }
  .ruler-tick { position: absolute; }
  .ruler-h .ruler-tick { top: 1px; border-inline-start: 1px solid #94a3b8; height: 8px; padding-inline-start: 2px; }
  .ruler-h .ruler-tick.major { height: 14px; }
  .ruler-v .ruler-tick { inset-inline-start: 1px; border-top: 1px solid #94a3b8; width: 8px; }
  .ruler-v .ruler-tick.major { width: 14px; }
  .status-bar {
    grid-area: status; display: flex; align-items: center; gap: 0; height: 28px; padding: 0 8px;
    background: var(--rb-panel); border-top: 1px solid var(--rb-border); font-size: 12px; color: var(--rb-muted);
    overflow: hidden;
  }
  .status-item { padding-inline: 10px; border-inline-end: 1px solid var(--rb-border); white-space: nowrap; }
  .status-item b { color: var(--rb-text); }
`;
