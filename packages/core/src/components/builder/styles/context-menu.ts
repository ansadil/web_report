import { css } from 'lit';

export const contextMenuStyles = css`    .ctx-menu {
      position: fixed;
      z-index: 200;
      min-width: 196px;
      padding: 4px;
      margin: 0;
      list-style: none;
      background: var(--rb-panel);
      border: 1px solid var(--rb-border);
      border-radius: 6px;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.14);
    }
    .ctx-menu button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 8px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--rb-text);
      font: inherit;
      font-size: 12px;
      text-align: start;
      cursor: pointer;
    }
    .ctx-menu button svg {
      flex: none;
      width: 16px;
      height: 16px;
      color: var(--rb-muted);
    }
    .ctx-menu button:hover:not(:disabled) {
      background: var(--rb-tool-bg);
    }
    .ctx-menu button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .ctx-menu .ctx-sep {
      height: 1px;
      margin: 4px 6px;
      background: var(--rb-border);
    }
`;
