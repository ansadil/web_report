/**
 * Non-text PDF elements: embedded raster images and vector QR codes / barcodes.
 * Loaded only together with the PDF renderer (lazy chunk), never from the main entry.
 */
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import type { PDFDocument, PDFImage, PDFPage, RGB } from 'pdf-lib';
import { rgb } from 'pdf-lib';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Decode a `data:` URL (base64 or percent-encoded) or fetch an http(s)/blob URL. */
export async function loadImageBytes(src: string): Promise<Uint8Array | null> {
  const s = src.trim();
  if (!s) return null;
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(s);
  if (m) {
    const isB64 = /;base64/i.test(m[2] ?? '');
    const payload = m[3] ?? '';
    if (isB64) {
      const bin = atob(payload.replace(/\s+/g, ''));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(s);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Embed PNG/JPEG bytes (sniffed by signature); other formats (SVG, GIF, WebP) are unsupported. */
export async function embedRaster(pdf: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch {
    /* corrupt image → caller draws a placeholder */
  }
  return null;
}

/** Draw `img` scaled to fit `box` (object-fit: contain), centred. */
export function drawImageContain(page: PDFPage, img: PDFImage, box: Box, opacity = 1): void {
  const scale = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h, opacity });
}

/** Vector QR code (quiet zone of one module), square, centred in `box`. Returns false if `payload` is empty/invalid. */
export function drawQr(
  page: PDFPage,
  payload: string,
  box: Box,
  opts: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; dark?: RGB; light?: RGB } = {},
): boolean {
  if (!payload.trim()) return false;
  let modules: { size: number; get(r: number, c: number): number | boolean };
  try {
    modules = QRCode.create(payload, { errorCorrectionLevel: opts.errorCorrectionLevel ?? 'M' }).modules;
  } catch {
    return false;
  }
  const n = modules.size + 2;
  const side = Math.min(box.w, box.h);
  const cell = side / n;
  const ox = box.x + (box.w - side) / 2;
  const oy = box.y + (box.h - side) / 2;
  page.drawRectangle({ x: ox, y: oy, width: side, height: side, color: opts.light ?? rgb(1, 1, 1) });
  const dark = opts.dark ?? rgb(0, 0, 0);
  for (let r = 0; r < modules.size; r++) {
    // Merge horizontal runs of dark modules into one rectangle each.
    let c = 0;
    while (c < modules.size) {
      if (!modules.get(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < modules.size && modules.get(r, c)) c++;
      page.drawRectangle({
        x: ox + (start + 1) * cell,
        y: oy + side - (r + 2) * cell,
        width: (c - start) * cell,
        height: cell,
        color: dark,
      });
    }
  }
  return true;
}

/**
 * Encode a 1-D barcode; returns the module pattern ('1' = bar) and the human-readable text,
 * or null when the payload is invalid for the symbology.
 */
export function encodeBarcode(payload: string, format = 'CODE128'): { bars: string; text: string } | null {
  if (!payload.trim()) return null;
  const target: { encodings?: { data: string; text: string }[] } = {};
  let valid = true;
  try {
    JsBarcode(target, payload, { format, valid: (v: boolean) => { valid = v; } });
  } catch {
    return null;
  }
  if (!valid || !target.encodings?.length) return null;
  return { bars: target.encodings.map((e) => e.data).join(''), text: target.encodings.map((e) => e.text).join('') };
}

/** Draw bars filling `box` horizontally (with a small quiet zone); `textHeight` is reserved at the bottom. */
export function drawBarcodeBars(page: PDFPage, bars: string, box: Box, textHeight: number, dark?: RGB, light?: RGB): void {
  if (light) page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, color: light });
  const quiet = 4;
  const unit = box.w / (bars.length + 2 * quiet);
  const barH = Math.max(1, box.h - textHeight);
  let i = 0;
  while (i < bars.length) {
    if (bars[i] !== '1') {
      i++;
      continue;
    }
    const start = i;
    while (i < bars.length && bars[i] === '1') i++;
    page.drawRectangle({
      x: box.x + (quiet + start) * unit,
      y: box.y + textHeight,
      width: (i - start) * unit,
      height: barH,
      color: dark ?? rgb(0, 0, 0),
    });
  }
}
