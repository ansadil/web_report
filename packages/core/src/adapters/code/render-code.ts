import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H';

export type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC' | 'ITF14';

export interface QrRenderSpec {
  readonly kind: 'qr';
  readonly payload: string;
  readonly errorCorrectionLevel?: QrErrorLevel;
  readonly color?: string;
  readonly background?: string;
}

export interface BarcodeRenderSpec {
  readonly kind: 'barcode';
  readonly payload: string;
  readonly format?: BarcodeFormat;
  readonly displayValue?: boolean;
  readonly color?: string;
  readonly background?: string;
}

export type CodeRenderSpec = QrRenderSpec | BarcodeRenderSpec;

function clampSize(px: number): number {
  return Math.max(48, Math.min(1024, Math.round(px)));
}

export async function renderCodeToDataUrl(spec: CodeRenderSpec, widthPx: number, heightPx: number): Promise<string> {
  const w = clampSize(widthPx);
  const h = clampSize(heightPx);
  const payload = spec.payload.trim();
  if (!payload) return '';

  const dark = spec.color?.trim() || '#000000';
  const light = spec.background?.trim() || '#ffffff';

  if (spec.kind === 'qr') {
    const size = Math.min(w, h);
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: spec.errorCorrectionLevel ?? 'M',
      margin: 1,
      width: size,
      color: { dark, light },
    });
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, payload, {
    format: spec.format ?? 'CODE128',
    displayValue: spec.displayValue !== false,
    margin: 4,
    width: 2,
    height: Math.max(20, Math.round(h * 0.55)),
    lineColor: dark,
    background: light,
    xmlDocument: document,
  });
  if (spec.displayValue !== false) {
    for (const text of svg.querySelectorAll('text')) {
      text.setAttribute('fill', dark);
    }
  }
  const serialized = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
}

export function parseCodeSpec(raw: string): CodeRenderSpec | null {
  try {
    const parsed = JSON.parse(raw) as CodeRenderSpec;
    if (parsed?.kind !== 'qr' && parsed?.kind !== 'barcode') return null;
    if (typeof parsed.payload !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
