import { css } from 'lit';

export const toolboxStyles = css`    .panel-title { font-size: 11px; text-transform: uppercase; color: #64748b; margin: 0 0 8px; letter-spacing: 0.5px; }
    .tool-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
    }
    .tool {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-height: 52px;
      padding: 6px 2px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      cursor: grab;
      user-select: none;
      color: #334155;
    }
    .tool svg { width: 20px; height: 20px; flex: none; color: var(--rb-accent); }
    .tool-label { font-size: 10.5px; line-height: 1.2; text-align: center; }
    .tool:hover {
      background: var(--rb-tool-bg);
      border-color: #cbd5e1;
    }
    .tool:active { cursor: grabbing; }
    .tool:focus-visible { outline: 2px solid var(--rb-accent); outline-offset: 2px; }
    .field-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 8px; border-radius: 6px; cursor: grab;
      background: #f8fafc; margin-bottom: 4px; user-select: none;
    }
    .field-row .type { color: #64748b; font-size: 11px; }
`;
