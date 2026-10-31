import { describe, expect, it } from 'vitest';
import { ribbonTabFromKey } from './ribbon-keys.js';

describe('ribbon tab keyboard', () => {
  it('moves forward with ArrowRight in LTR and ArrowLeft in RTL', () => {
    expect(ribbonTabFromKey('home', 'ArrowRight', 'ltr')).toBe('insert');
    expect(ribbonTabFromKey('home', 'ArrowLeft', 'ltr')).toBe('file');
    expect(ribbonTabFromKey('home', 'ArrowLeft', 'rtl')).toBe('insert');
    expect(ribbonTabFromKey('home', 'ArrowRight', 'rtl')).toBe('file');
  });

  it('wraps and jumps to the ends', () => {
    expect(ribbonTabFromKey('preview', 'ArrowRight', 'ltr')).toBe('file');
    expect(ribbonTabFromKey('file', 'ArrowLeft', 'ltr')).toBe('preview');
    expect(ribbonTabFromKey('layout', 'Home', 'rtl')).toBe('file');
    expect(ribbonTabFromKey('file', 'End', 'ltr')).toBe('preview');
  });
});
