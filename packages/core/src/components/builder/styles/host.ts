import { css } from 'lit';

export const hostStyles = css`
    :host {
      --rb-bg: #f1f5f9;
      --rb-panel: #ffffff;
      --rb-text: #111111;
      --rb-muted: #64748b;
      --rb-border: #e5e7eb;
      --rb-accent: #1f5fa8;
      --rb-accent-hover: #174a85;
      --rb-canvas-bg: #e7ebf1;
      --rb-tool-bg: #f8fafc;
      --rb-rail: 40px;
      --rb-side-w: 262px;
      --rb-prop-w: 292px;
      --rb-font: Cairo, Tajawal, 'Noto Naskh Arabic', 'Segoe UI', system-ui, sans-serif;
      display: grid;
      grid-template-columns: var(--rb-side-w) minmax(0, 1fr) var(--rb-prop-w);
      grid-template-rows: 34px auto minmax(0, 1fr) 30px 28px;
      grid-template-areas:
        'title title title'
        'ribbon ribbon ribbon'
        'side center props'
        'pages pages pages'
        'status status status';
      height: 100%;
      min-height: 540px;
      background: var(--rb-bg);
      font-family: var(--rb-font);
      font-size: 13px;
      color: var(--rb-text);
    }
    :host([data-left-collapsed='true']) { --rb-side-w: var(--rb-rail); }
    .titlebar { grid-area: title; }
    .page-tabs { grid-area: pages; }
    aside.props { grid-area: props; }
`;
