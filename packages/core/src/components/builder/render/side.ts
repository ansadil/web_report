import { html, nothing } from 'lit';
import { icon } from '../api.js';
import type { SideSectionKey } from '../types.js';

export interface SideSectionState {
  key: SideSectionKey;
  title: string;
  collapsed: boolean;
  testId: string;
}

export interface SideSectionCallbacks {
  onToggle: () => void;
}

export function renderSideSection(state: SideSectionState, cb: SideSectionCallbacks, content: unknown) {
  return html`
    <section class="side-section" data-section=${state.key} data-testid=${state.testId}>
      <button
        type="button"
        class="section-head"
        data-control=${`toggle-section-${state.key}`}
        aria-expanded=${state.collapsed ? 'false' : 'true'}
        @click=${cb.onToggle}
      >
        <span class="section-title">${state.title}</span>
        ${icon(state.collapsed ? 'sectionDown' : 'sectionUp')}
      </button>
      ${state.collapsed ? nothing : html`<div class="section-body">${content}</div>`}
    </section>
  `;
}
