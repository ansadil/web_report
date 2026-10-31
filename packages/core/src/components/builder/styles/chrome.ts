import { css } from 'lit';

export const chromeStyles = css`
  .ribbon-host, .status-host { display: contents; }
  .ribbon { grid-area: ribbon; background: var(--rb-panel); border-bottom: 1px solid var(--rb-border); min-width: 0; }
  .ribbon-tabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid var(--rb-border); background: #f8fafc; }
  .ribbon-tab {
    border: 0; background: transparent; padding: 6px 12px; cursor: pointer; color: var(--rb-muted);
    font: inherit; font-weight: 600; border-bottom: 2px solid transparent;
  }
  .ribbon-tab.active { color: var(--rb-accent); border-bottom-color: var(--rb-accent); background: #fff; }
  .ribbon-body { display: flex; align-items: center; gap: 8px; padding: 6px 8px; min-height: 52px; overflow: auto; }
  .ribbon-pane { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ribbon-pane[hidden] { display: none; }
  .ribbon-group, .ribbon-insert { display: flex; flex-wrap: wrap; gap: 4px; }
  .ribbon-cmd, .ribbon-insert-btn {
    display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--rb-border);
    background: var(--rb-panel); border-radius: 6px; padding: 4px 8px; cursor: pointer; font: inherit; font-size: 12px;
  }
  .ribbon-cmd:disabled { opacity: 0.45; cursor: not-allowed; }
  .ribbon-insert-btn { cursor: grab; flex-direction: column; min-width: 64px; }
  .band-strip { display: flex; flex-direction: column; }
  .band-head {
    height: 18px; display: flex; align-items: center; padding-inline: 6px;
    background: #334155; color: #fff; font-size: 10px; font-weight: 700; flex: none;
  }
  .band-head .band-label {
    position: static; inset: auto; background: transparent; color: inherit; padding: 0; pointer-events: none;
  }
  .el-name {
    position: absolute; top: 0; inset-inline-end: 0; z-index: 4; max-width: 100%;
    background: #2563eb; color: #fff; font-size: 9px; line-height: 14px; padding: 0 4px;
    pointer-events: none; overflow: hidden; white-space: nowrap;
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
