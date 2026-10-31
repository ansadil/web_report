import { css } from 'lit';

export const toolbarStyles = css`    .toolbar {
      background: var(--rb-panel);
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .toolbar h2 {
      font-size: 14px; margin: 0; flex: 1; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
    }
    .toolbar .sep { width: 1px; height: 22px; background: var(--rb-border); margin: 0 4px; }
    .toolbar input.name {
      padding: 5px 8px; border: 1px solid var(--rb-border); border-radius: 6px;
      font-size: 13px; min-width: 0; width: 100%;
    }
    .toolbar button {
      padding: 5px 10px; border: 1px solid var(--rb-border); background: var(--rb-panel);
      border-radius: 6px; cursor: pointer; color: var(--rb-text);
      display: inline-flex; align-items: center; gap: 6px; line-height: 1; font-size: 13px;
    }
    .toolbar button svg { flex: none; }
    .toolbar button.icon-only { padding: 5px; }
    .toolbar button.primary { background: var(--rb-accent); color: #fff; border-color: var(--rb-accent); }
    .toolbar button:hover { background: var(--rb-tool-bg); }
    .toolbar button.primary:hover { background: var(--rb-accent-hover); }
    .toolbar button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      background: var(--rb-panel);
    }
    .toolbar .customize {
      position: relative;
    }
    .toolbar .menu {
      position: absolute; top: calc(100% + 4px); inset-inline-end: 0;
      background: var(--rb-panel); border: 1px solid var(--rb-border); border-radius: 6px;
      padding: 6px; min-width: 180px; box-shadow: 0 6px 24px rgba(0,0,0,0.08);
      display: grid; gap: 2px; z-index: 50;
    }
    .toolbar .menu label {
      display: flex; align-items: center; gap: 6px; padding: 4px 6px;
      border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    .toolbar .menu label:hover { background: var(--rb-tool-bg); }
    .zoom-tools {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      padding: 2px;
      background: var(--rb-tool-bg);
    }
    .toolbar .zoom-tools button {
      padding: 4px;
      border-color: transparent;
      background: transparent;
    }
    .zoom-value {
      min-width: 46px;
      padding: 0 4px;
      border: 0;
      background: transparent;
      color: var(--rb-text);
      font-size: 12px;
      text-align: center;
      cursor: pointer;
    }
    .doc-name {
      display: grid;
      gap: 4px;
      min-width: 0;
      margin-bottom: 8px;
    }
    .doc-name label {
      font-size: 11px;
      color: var(--rb-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
`;
