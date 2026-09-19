import { describe, expect, test } from 'bun:test';
import { renderChatMarkdown, renderMarkdown } from './markdown.ts';

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

test('chat markdown renders fences, headings and links but escapes raw html', () => {
  const html = renderChatMarkdown('## Why\n\n```ts\nconst a = 1;\n```\n\n[docs](https://example.com) <b>x</b>');
  expect(html).toContain('<h2>Why</h2>');
  expect(html).toContain('<pre><code class="language-ts">const a = 1;\n</code></pre>');
  expect(html).toContain('<a href="https://example.com">docs</a>');
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
});
