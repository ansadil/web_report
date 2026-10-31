/**
 * Script-agnostic text layout for the PDF exporter.
 *
 * Pipeline (each step happens exactly once, on logical text):
 *   1. wrap logical text into lines by measured width (word boundaries, falling back to
 *      grapheme boundaries for over-long words);
 *   2. per line: Unicode bidi embedding levels (bidi-js), font selection per code point
 *      by glyph coverage → "items" of uniform (level, face);
 *   3. shape every item with its own direction (odd level ⇒ RTL) via the {@link ShapingFace}
 *      (HarfBuzz in production). A shaper returns glyphs already in visual order;
 *   4. reorder the items visually (UAX #9 rule L2) and place glyphs left → right.
 *
 * The result is a list of positioned glyph IDs, so the PDF writer must not (and does not)
 * apply any further shaping or reordering.
 */
import bidiFactory from 'bidi-js';

export interface ShapedGlyph {
  /** Glyph id in the face. */
  readonly gid: number;
  /** Advance / offsets in em units (font units ÷ unitsPerEm). */
  readonly xAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
  /** UTF-16 index (into the shaped string) of the first character of this glyph's cluster. */
  readonly cluster: number;
}

export interface ShapingFace {
  /** Stable identifier (used for caching and for font lookup by the PDF writer). */
  readonly id: string;
  hasCodePoint(cp: number): boolean;
  /**
   * Shape `text.slice(start, end)` (with the surrounding text as shaping context) in one
   * direction. Returned glyphs must be in visual (left → right) order; clusters index `text`.
   */
  shape(text: string, start: number, end: number, rtl: boolean): readonly ShapedGlyph[];
}

/** Fallback chain: the first face is preferred for Arabic script, the rest for anything else. */
export interface FaceChain {
  /** Face used for Arabic-script code points (letters, harakat, Arabic-Indic digits). */
  readonly arabic: ShapingFace;
  /** Face used for Latin letters, Western digits and general punctuation. */
  readonly latin: ShapingFace;
}

export interface PositionedGlyph {
  readonly face: ShapingFace;
  readonly gid: number;
  /** Position relative to the line origin, in em units. */
  readonly x: number;
  readonly y: number;
  /** Pen advance after this glyph, in em units. */
  readonly advance: number;
  /** Characters (logical order) this glyph stands for; empty for secondary glyphs of a cluster. */
  readonly text: string;
}

export interface LaidOutLine {
  /** Logical text of the line. */
  readonly text: string;
  /** Advance width in em units. */
  readonly width: number;
  readonly glyphs: readonly PositionedGlyph[];
  /** Whether the paragraph base direction is RTL. */
  readonly rtl: boolean;
}

const bidi = bidiFactory();

const ARABIC_SCRIPT_RE = /\p{Script=Arabic}/u;
const MARK_OR_FORMAT_RE = /[\p{M}\p{Cf}]/u;
const ASCII_DIGIT_RE = /[0-9]/;

interface Item {
  readonly start: number;
  readonly end: number;
  readonly level: number;
  readonly face: ShapingFace;
}

function pickFace(cp: number, ch: string, prev: ShapingFace | null, chain: FaceChain): ShapingFace {
  if (prev && MARK_OR_FORMAT_RE.test(ch)) return prev;
  if (ARABIC_SCRIPT_RE.test(ch)) {
    return chain.arabic.hasCodePoint(cp) || !chain.latin.hasCodePoint(cp) ? chain.arabic : chain.latin;
  }
  if (ASCII_DIGIT_RE.test(ch)) {
    // Western digits always from the Latin face so a number never mixes two digit designs.
    return chain.latin.hasCodePoint(cp) || !chain.arabic.hasCodePoint(cp) ? chain.latin : chain.arabic;
  }
  const isLetterOfOtherScript = /\p{L}/u.test(ch);
  if (!isLetterOfOtherScript && prev && prev.hasCodePoint(cp)) return prev;
  if (chain.latin.hasCodePoint(cp)) return chain.latin;
  if (chain.arabic.hasCodePoint(cp)) return chain.arabic;
  return prev ?? chain.latin;
}

/** Split one logical line into (bidi level, face) items, in logical order. */
export function itemize(text: string, rtl: boolean, chain: FaceChain): Item[] {
  if (text.length === 0) return [];
  const { levels } = bidi.getEmbeddingLevels(text, rtl ? 'rtl' : 'ltr');
  const items: Item[] = [];
  let prevFace: ShapingFace | null = null;
  let cur: { start: number; level: number; face: ShapingFace } | null = null;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const len = ch.length;
    const face = pickFace(cp, ch, prevFace, chain);
    // Marks inherit the level of their base so a cluster is never split across items.
    const level: number = cur && MARK_OR_FORMAT_RE.test(ch) ? cur.level : levels[i]!;
    if (!cur || cur.face !== face || cur.level !== level) {
      if (cur) items.push({ start: cur.start, end: i, level: cur.level, face: cur.face });
      cur = { start: i, level, face };
    }
    prevFace = face;
    i += len;
  }
  if (cur) items.push({ start: cur.start, end: text.length, level: cur.level, face: cur.face });
  return items;
}

/** UAX #9 rule L2: reverse any contiguous sequence of items at level ≥ k, for k from max down to the lowest odd level. */
export function visualOrder<T extends { readonly level: number }>(items: readonly T[]): T[] {
  const out = items.slice();
  if (out.length < 2) return out;
  let max = 0;
  let minOdd = Infinity;
  for (const it of out) {
    if (it.level > max) max = it.level;
    if (it.level % 2 === 1 && it.level < minOdd) minOdd = it.level;
  }
  if (minOdd === Infinity) return out;
  for (let k = max; k >= minOdd; k--) {
    let i = 0;
    while (i < out.length) {
      if (out[i]!.level >= k) {
        let j = i;
        while (j + 1 < out.length && out[j + 1]!.level >= k) j++;
        const seg = out.slice(i, j + 1).reverse();
        out.splice(i, seg.length, ...seg);
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  return out;
}

/**
 * Text a glyph stands for, in the glyph's visual direction. Extractors (pdf.js, poppler)
 * rebuild logical order by reversing RTL runs character by character, so a ligature such as
 * lam-alef in an RTL run must map to «ال»-ordered code points to come out as «لا».
 */
function clusterText(s: string, rtl: boolean): string {
  return rtl && s.length > 1 ? Array.from(s).reverse().join('') : s;
}

export class TextLayouter {
  private readonly cache = new Map<string, LaidOutLine>();

  constructor(private readonly chain: FaceChain) {}

  /** Shape and position one logical line (no wrapping). */
  layoutLine(text: string, rtl: boolean): LaidOutLine {
    const key = `${rtl ? 'r' : 'l'}\u0000${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const items = itemize(text, rtl, this.chain);
    const glyphs: PositionedGlyph[] = [];
    let x = 0;
    for (const item of visualOrder(items)) {
      const itemRtl = item.level % 2 === 1;
      const shaped = item.face.shape(text, item.start, item.end, itemRtl);
      // Cluster boundaries (logical) → map every glyph to the characters it represents.
      const clusterStarts = Array.from(new Set(shaped.map((g) => g.cluster))).sort((a, b) => a - b);
      const clusterEnd = new Map<number, number>();
      clusterStarts.forEach((c, idx) => clusterEnd.set(c, clusterStarts[idx + 1] ?? item.end));
      const seen = new Set<number>();
      for (const g of shaped) {
        // In RTL runs the first glyph (logically) of a multi-glyph cluster is the right-most one;
        // attaching the text to whichever glyph we meet first is enough for ToUnicode purposes.
        const first = !seen.has(g.cluster);
        seen.add(g.cluster);
        glyphs.push({
          face: item.face,
          gid: g.gid,
          x: x + g.xOffset,
          y: g.yOffset,
          advance: g.xAdvance,
          text: first ? clusterText(text.slice(g.cluster, clusterEnd.get(g.cluster) ?? item.end), itemRtl) : '',
        });
        x += g.xAdvance;
      }
    }
    const line: LaidOutLine = { text, width: x, glyphs, rtl };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(key, line);
    return line;
  }

  /**
   * Wrap logical text (may contain `\n`) to `maxWidth` (same unit as `size`), then lay out
   * every resulting line (bidi + shaping) independently.
   */
  wrap(text: string, rtl: boolean, size: number, maxWidth: number, maxLines = Infinity): LaidOutLine[] {
    const measure = (s: string): number => this.layoutLine(s, rtl).width * size;
    return wrapText(text, measure, maxWidth, maxLines).map((l) => this.layoutLine(l, rtl));
  }
}

/**
 * Greedy word wrap on *logical* text using a measuring callback. Breaks at whitespace;
 * words wider than the box are broken between grapheme clusters. Lines beyond `maxLines`
 * are dropped (clipped).
 */
export function wrapText(
  text: string,
  measure: (s: string) => number,
  maxWidth: number,
  maxLines = Infinity,
): string[] {
  const out: string[] = [];
  const fits = (s: string): boolean => measure(s) <= maxWidth + 1e-6;
  const rtrim = (s: string): string => s.replace(/\s+$/u, '');
  for (const para of text.split(/\r?\n/)) {
    if (out.length >= maxLines) break;
    if (!Number.isFinite(maxWidth) || maxWidth <= 0 || fits(para)) {
      out.push(para);
      continue;
    }
    const words = para.match(/\S+\s*|\s+/g) ?? [para];
    let current = '';
    const flush = (): void => {
      out.push(rtrim(current));
      current = '';
    };
    for (const word of words) {
      if (out.length >= maxLines) break;
      const candidate = current + word;
      if (fits(rtrim(candidate))) {
        current = candidate;
        continue;
      }
      if (current.trim().length > 0) flush();
      else current = '';
      if (out.length >= maxLines) break;
      const bare = rtrim(word).replace(/^\s+/u, '');
      if (bare.length === 0) continue;
      if (fits(bare)) {
        current = word.replace(/^\s+/u, '');
        continue;
      }
      // A single word wider than the box: break between grapheme clusters.
      for (const g of graphemes(bare)) {
        if (current.length > 0 && !fits(current + g)) {
          flush();
          if (out.length >= maxLines) break;
        }
        current += g;
      }
      if (/\s$/u.test(word)) current += ' ';
    }
    if (out.length < maxLines && current.trim().length > 0) flush();
  }
  return Number.isFinite(maxLines) ? out.slice(0, maxLines) : out;
}

/** Grapheme-ish segmentation: a base code point followed by its combining marks / joiners. */
export function graphemes(s: string): string[] {
  type SegmenterCtor = new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> };
  const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment);
  const out: string[] = [];
  for (const ch of s) {
    if (out.length > 0 && MARK_OR_FORMAT_RE.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
