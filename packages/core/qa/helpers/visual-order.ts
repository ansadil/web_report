// Visual (drawing) order reference for RTL paragraphs, used to judge PDF output by the
// glyph sequence actually drawn (drawnRuns) instead of by pdf.js's re-ordering heuristics.
//
// Why: pdf.js text extraction re-applies its own bidi guess per text item. It does not keep
// invisible bidi controls (U+200F RLM inserted by Intl 'ar' short dates) and it classifies a
// mostly-digit/symbol line as LTR, so a correctly drawn line can extract in a "wrong" logical
// order. The drawn glyph sequence (left→right on the page) is what the reader sees, so we
// compare it against the UAX #9 visual order of the logical string in an RTL paragraph.
//
// Reference implementation: bidi-js (UAX #9 rules W1–W7, N1–N2, I1–I2, L2), paragraph level
// forced to RTL. Mirroring (L4) is intentionally NOT applied, because drawnRuns decodes
// glyphs to their source code points via ToUnicode. Cross-checked against Chromium's ICU
// bidi on the QA corpus (see evidence/after/claims/chromium-visual.json); the sanity tests in
// pdf-arabic.qa.test.ts pin a few results so a library change cannot silently move the oracle.
import bidiFactory from 'bidi-js';
import { norm } from './pdf-text.js';

const bidi = bidiFactory();
const BIDI_CONTROLS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

/** Strip invisible bidi controls (they draw no ink) and NFKC-normalize. */
export function inkOnly(s: string): string {
  return norm(s.replace(BIDI_CONTROLS, '')).replace(BIDI_CONTROLS, '');
}

/** Left→right visual order of `logical` laid out in an RTL paragraph (no mirroring), ink only. */
export function visualOrderRtl(logical: string): string {
  const levels = bidi.getEmbeddingLevels(logical, 'rtl');
  const chars = [...logical];
  // bidi-js works on UTF-16 indices; the QA corpus is BMP-only, so code units == code points.
  if (chars.length !== logical.length) throw new Error('visualOrderRtl: non-BMP text not supported');
  for (const [start, end] of bidi.getReorderSegments(logical, levels)) {
    const seg = chars.slice(start, end + 1).reverse();
    chars.splice(start, seg.length, ...seg);
  }
  // Reversing the segments in sequence yields the display string left→right (bidi-js L2).
  return inkOnly(chars.join(''));
}

/** True if some drawn run (ink only) equals the expected visual order. */
export function drawnContainsVisual(runs: string[], logical: string): boolean {
  const want = visualOrderRtl(logical);
  return runs.some((r) => inkOnly(r) === want);
}
