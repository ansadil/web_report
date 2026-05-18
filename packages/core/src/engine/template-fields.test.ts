import { describe, it, expect } from 'vitest';
import { substituteFieldPlaceholders, stripHtmlToPlainText } from './template-fields.js';

describe('substituteFieldPlaceholders', () => {
  it('replaces <field> with row values', () => {
    const out = substituteFieldPlaceholders('Hello <name>, total <amount>', { name: 'Ada', amount: 42 }, 'en', 'decimal2');
    expect(out).toBe('Hello Ada, total 42.00');
  });

  it('leaves unknown placeholders unchanged', () => {
    const out = substituteFieldPlaceholders('<div> and <missing>', {}, 'en');
    expect(out).toBe('<div> and <missing>');
  });

  it('escapes injected markup in field values', () => {
    const out = substituteFieldPlaceholders('<name>', { name: '<script>' }, 'en');
    expect(out).toBe('&lt;script&gt;');
  });
});

describe('stripHtmlToPlainText', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtmlToPlainText('<p>Hi <strong>there</strong></p>')).toBe('Hi there');
  });
});
