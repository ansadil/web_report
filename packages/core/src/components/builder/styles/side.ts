import { css } from 'lit';

export const sideStyles = css`    aside.left {
      grid-area: side;
      background: var(--rb-panel);
      border-inline-end: 1px solid var(--rb-border);
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    aside.left.collapsed .side-body,
    aside.left.collapsed .panel-head .title {
      display: none;
    }
    .panel-head {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--rb-border);
      flex: 0 0 auto;
      min-height: 36px;
      box-sizing: border-box;
    }
    .panel-head .title {
      flex: 1;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--rb-muted);
      letter-spacing: 0.8px;
      font-weight: 600;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .panel-head button.collapse,
    .section-head {
      padding: 4px;
      border: 1px solid transparent;
      background: transparent;
      border-radius: 4px;
      cursor: pointer;
      color: var(--rb-muted);
      display: inline-flex;
      align-items: center;
    }
    .panel-head button.collapse:hover,
    .section-head:hover {
      background: var(--rb-tool-bg);
      color: var(--rb-text);
    }
    .side-body {
      flex: 1 1 auto;
      overflow: hidden;
      padding: 8px;
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .side-fill {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      gap: 8px;
    }
    .side-fill[hidden] { display: none !important; }
    .side-body > div:not(.side-fill) {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }
    .side-fill > .side-section {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .side-fill > .side-section .section-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }
    .side-section {
      border: 1px solid var(--rb-border);
      background: var(--rb-panel);
      border-radius: 6px;
      overflow: hidden;
      min-width: 0;
      flex: 0 0 auto;
    }
    .side-section[data-section='properties'] {
      flex: 1 1 auto;
      min-height: 160px;
      display: flex;
      flex-direction: column;
    }
    .section-head {
      width: 100%;
      justify-content: space-between;
      border-radius: 0;
      padding: 7px 8px;
      border-bottom: 1px solid var(--rb-border);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }
    .section-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .section-body {
      padding: 8px;
      min-width: 0;
      box-sizing: border-box;
    }
    .side-section[data-section='properties'] .section-body {
      flex: 1 1 auto;
      overflow-y: auto;
      min-height: 0;
    }
`;
