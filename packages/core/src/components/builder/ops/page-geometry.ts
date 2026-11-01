import {
  MIN_CONTENT_MM,
  adjustPage,
  applyPageSetup,
  marginClampNotice,
  mmToLength,
  type MarginSide,
} from '../../../engine/page-setup.js';
import type { Page } from '../../../schema/report-schema.js';
import { formatLocalizedNumber } from '../status-bar.js';
import type { BuilderSession } from '../session.js';
import { commitSchema, reclampAllRootBandElements } from './commands.js';

const SIDES: readonly MarginSide[] = ['top', 'right', 'bottom', 'left'];

function cmLabel(session: BuilderSession, mm: number): string {
  const locale = session.uiLocale;
  const digits = session.schema.meta.pageNumberDigits ?? 'locale';
  const unit = locale.toLowerCase().startsWith('ar') ? 'سم' : 'cm';
  return `${formatLocalizedNumber(mmToLength(mm, 'cm'), { locale, digits }, 2)} ${unit}`;
}

function dropClamped(session: BuilderSession): BuilderSession['marginFeedback'] {
  const next = { ...session.marginFeedback };
  for (const side of SIDES) {
    if (next[side]?.kind === 'clamped') delete next[side];
  }
  return next;
}

function recordClamp(session: BuilderSession, before: Page['margins'], after: Page, replace: boolean): void {
  const changed = SIDES.filter((side) => before[side] !== after.margins[side]);
  if (changed.length === 0) {
    session.setMarginNotice('');
    if (replace) session.setMarginFeedback({});
    else session.setMarginFeedback(dropClamped(session));
    return;
  }
  const notice = marginClampNotice(cmLabel(session, MIN_CONTENT_MM), session.uiLocale);
  const feedback = replace ? {} : dropClamped(session);
  const digits = session.schema.meta.pageNumberDigits ?? 'locale';
  for (const side of changed) {
    feedback[side] = {
      raw: formatLocalizedNumber(after.margins[side] / 10, { locale: session.uiLocale, digits }, 2),
      error: notice,
      kind: 'clamped',
    };
  }
  session.setMarginNotice(notice);
  session.setMarginFeedback(feedback);
}

/** Paper size or orientation changed. Clamp margins and leave an inline notice. */
export function commitPageGeometry(session: BuilderSession, patch: Partial<Pick<Page, 'size' | 'orientation'>>): void {
  const before = session.schema.page;
  const result = adjustPage(before, patch);
  recordClamp(session, before.margins, result.page, false);
  commitSchema(session, { ...session.schema, page: result.page });
  reclampAllRootBandElements(session);
}

/**
 * Clamp a template that just loaded. Returns the page to store.
 * A clamped template always gets a visible notice; a fitting one does not.
 */
export function noteLoadedMargins(session: BuilderSession, page: Page): Page {
  const next = applyPageSetup(page);
  recordClamp(session, page.margins, next, true);
  return next;
}
