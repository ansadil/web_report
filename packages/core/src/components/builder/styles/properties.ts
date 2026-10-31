import { css } from 'lit';

export const propertiesStyles = css`    form.props {
      display: grid;
      gap: 8px;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    form.props label { display: grid; gap: 4px; font-size: 11px; color: #475569; min-width: 0; }
    form.props input, form.props select, form.props textarea {
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
    form.props textarea {
      min-height: 120px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    form.props .hint {
      margin: 0;
      font-size: 11px;
      color: #64748b;
      line-height: 1.35;
    }
    form.props .field-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    form.props .field-chips .chip {
      padding: 2px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #f8fafc;
      font-size: 11px;
      cursor: pointer;
    }
    form.props .field-chips .chip:hover {
      background: #e2e8f0;
    }
    form.props input[type='checkbox'],
    form.props input[type='color'] {
      width: auto;
      max-width: none;
      justify-self: start;
    }
    form.props label:has(input[type='checkbox']) {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 8px;
      flex-wrap: wrap;
    }
    form.props label:has(input[type='checkbox']) input[type='checkbox'] {
      margin-top: 2px;
      flex: none;
    }
    form.props .grid2,
    form.props .grid4 {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      min-width: 0;
    }
    form.props button.danger {
      background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; padding: 6px;
      border-radius: 4px; cursor: pointer;
    }
    form.props button.secondary {
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
    form.props .band-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  
`;
