import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
  test('renders the supported subset', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('*italic*')).toContain('<em>italic</em>');
    expect(renderMarkdown('`reconcileFiles`')).toContain('<code>reconcileFiles</code>');

    const bullets = renderMarkdown('- one\n- two');
    expect(bullets).toContain('<ul>');
    expect(bullets).toContain('<li>one</li>');
    expect(bullets).toContain('<li>two</li>');

    const ordered = renderMarkdown('1. first\n2. second');
    expect(ordered).toContain('<ol>');
    expect(ordered).toContain('<li>first</li>');
  });

  test('turns single newlines into <br> for plain-text guide compatibility', () => {
    expect(renderMarkdown('one sentence.\nanother sentence.')).toContain('<br>');
  });

  test('escapes raw HTML', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');

    const img = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(img).not.toContain('<img');
  });

  test('renders unsupported markdown as literal text', () => {
    expect(renderMarkdown('# heading')).toContain('# heading');
    expect(renderMarkdown('# heading')).not.toContain('<h1>');

    expect(renderMarkdown('[link](https://example.com)')).toContain('[link](https://example.com)');
    expect(renderMarkdown('[link](https://example.com)')).not.toContain('<a ');

    expect(renderMarkdown('> quote')).not.toContain('<blockquote>');
  });
});
