import { describe, it, expect } from 'vitest';
import { renderCodeToDataUrl } from './render-code.js';

describe('renderCodeToDataUrl', () => {
  it('renders qr and barcode as data URLs', async () => {
    const qr = await renderCodeToDataUrl({ kind: 'qr', payload: 'TEST-QR' }, 120, 120);
    expect(qr.startsWith('data:image/png')).toBe(true);

    const bc = await renderCodeToDataUrl(
      { kind: 'barcode', payload: '123456789012', format: 'CODE128', displayValue: false },
      200,
      80,
    );
    expect(bc.length).toBeGreaterThan(0);
  });

  it('applies style color to generated codes', async () => {
    const qr = await renderCodeToDataUrl(
      { kind: 'qr', payload: 'COLOR', color: '#2563eb', background: '#f8fafc' },
      120,
      120,
    );
    expect(qr.startsWith('data:image/png')).toBe(true);

    const bc = await renderCodeToDataUrl(
      {
        kind: 'barcode',
        payload: '123456789012',
        format: 'CODE128',
        displayValue: false,
        color: '#b91c1c',
        background: '#fff7ed',
      },
      200,
      80,
    );
    expect(bc).toContain('b91c1c');
    expect(bc).toContain('fff7ed');
  });
});
