import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown-html.js';

describe('markdownToHtml', () => {
  it('renders headings and bold', () => {
    const html = markdownToHtml('# Title\n\nHello **world**');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
  });

  it('renders list items', () => {
    const html = markdownToHtml('- one\n- two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });
});
