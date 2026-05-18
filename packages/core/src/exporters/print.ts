/** Styles for the detached print document (matches viewer layout + page breaks between visual sheets). */
const PRINT_DOCUMENT_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  body {
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #111;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .rw-visual-pages-root {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .rw-page-visual-sheet {
    margin-bottom: 16px;
  }
  .rw-page-visual-sheet:last-child {
    margin-bottom: 0;
  }
  @media print {
    body {
      display: block;
    }
    .rw-visual-pages-root {
      display: block;
    }
    .rw-page-visual-sheet {
      page-break-after: always;
      break-after: page;
    }
    .rw-page-visual-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  }
`;

function inferTextDirection(root: HTMLElement): 'ltr' | 'rtl' {
  const tagged = root.querySelector('[data-dir]');
  const d = tagged?.getAttribute('data-dir');
  return d === 'rtl' ? 'rtl' : 'ltr';
}

/** Clone report markup and inline chart canvases as PNG so print matches the on-screen preview. */
function serializeReportSubtree(source: HTMLElement): string {
  const clone = source.cloneNode(true) as HTMLElement;
  const srcCanvas = source.querySelectorAll('canvas');
  const dstCanvas = clone.querySelectorAll('canvas');
  const n = Math.min(srcCanvas.length, dstCanvas.length);
  for (let i = 0; i < n; i++) {
    const dst = dstCanvas.item(i);
    const src = srcCanvas.item(i);
    if (!dst || !src) continue;
    const img = document.createElement('img');
    try {
      img.src = src.toDataURL('image/png');
    } catch {
      img.removeAttribute('src');
    }
    img.setAttribute('alt', '');
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
    dst.replaceWith(img);
  }
  return clone.outerHTML;
}

/**
 * Opens the print dialog for the given report DOM subtree (e.g. stacked `.rw-visual-pages-root` or a single `.rw-report`).
 * Uses a hidden iframe so only that fragment prints—not the host page chrome—and page-break CSS applies between sheets.
 * Falls back to `window.print()` when no root is provided or iframe print is unavailable.
 */
export function triggerPrint(contentRoot?: HTMLElement | null): void {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return;

  if (!contentRoot) {
    window.print();
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    window.print();
    return;
  }

  const dir = inferTextDirection(contentRoot);
  const bodyHtml = serializeReportSubtree(contentRoot);

  doc.open();
  doc.write(
    `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>${PRINT_DOCUMENT_CSS}</style></head><body>${bodyHtml}</body></html>`,
  );
  doc.close();

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  win.addEventListener('afterprint', () => cleanup(), { once: true });
  win.focus();

  requestAnimationFrame(() => {
    try {
      win.print();
    } catch {
      cleanup();
      window.print();
      return;
    }
    setTimeout(() => {
      if (iframe.isConnected) cleanup();
    }, 2_000);
  });
}
