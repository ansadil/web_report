import type { RibbonTab } from './types.js';

export const RIBBON_TABS: readonly RibbonTab[] = ['file', 'home', 'insert', 'layout', 'page', 'view', 'preview'];

/** Next ribbon tab for Arrow/Home/End. Arrow keys follow the writing direction. */
export function ribbonTabFromKey(current: RibbonTab, key: string, dir: 'ltr' | 'rtl'): RibbonTab | null {
  const index = RIBBON_TABS.indexOf(current);
  if (index < 0) return null;
  const last = RIBBON_TABS.length - 1;
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  if (key === 'Home') return RIBBON_TABS[0]!;
  if (key === 'End') return RIBBON_TABS[last]!;
  if (key === forward) return RIBBON_TABS[(index + 1) % RIBBON_TABS.length]!;
  if (key === backward) return RIBBON_TABS[(index - 1 + RIBBON_TABS.length) % RIBBON_TABS.length]!;
  return null;
}
