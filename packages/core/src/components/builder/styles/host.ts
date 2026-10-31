import { css } from 'lit';

export const hostStyles = css`
    :host {
      --rb-bg: #f1f5f9;
      --rb-panel: #ffffff;
      --rb-text: #111111;
      --rb-muted: #64748b;
      --rb-border: #e5e7eb;
      --rb-accent: #2563eb;
      --rb-accent-hover: #1d4ed8;
      --rb-canvas-bg: #e2e8f0;
      --rb-tool-bg: #f8fafc;
      --rb-rail: 40px;
      --rb-side-w: 340px;
      --rb-font: Cairo, Tajawal, 'Noto Naskh Arabic', 'Segoe UI', system-ui, sans-serif;
      display: grid;
      grid-template-columns: var(--rb-side-w) minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'ribbon ribbon'
        'side center'
        'status status';
      height: 100%;
      min-height: 540px;
      background: var(--rb-bg);
      font-family: var(--rb-font);
      font-size: 13px;
      color: var(--rb-text);
    }
    :host([data-left-collapsed='true']) { --rb-side-w: var(--rb-rail); }
`;
