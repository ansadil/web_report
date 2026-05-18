import { toPng, toBlob } from 'html-to-image';

export interface ImageExportOptions {
  readonly pixelRatio?: number;
  readonly backgroundColor?: string;
}

export async function exportPng(element: HTMLElement, opts: ImageExportOptions = {}): Promise<Blob> {
  const blob = await toBlob(element, {
    pixelRatio: opts.pixelRatio ?? 2,
    backgroundColor: opts.backgroundColor ?? '#ffffff',
    cacheBust: true,
  });
  if (!blob) {
    const dataUrl = await toPng(element, { pixelRatio: opts.pixelRatio ?? 2, backgroundColor: opts.backgroundColor ?? '#ffffff' });
    const res = await fetch(dataUrl);
    return await res.blob();
  }
  return blob;
}
