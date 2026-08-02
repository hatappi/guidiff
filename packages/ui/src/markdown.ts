import MarkdownIt from 'markdown-it';

// The 'zero' preset disables every rule; only the subset below is enabled,
// so unsupported syntax (headings, links, tables, ...) stays literal text.
// html: false keeps raw HTML in guide text escaped — the output is safe to
// inject via dangerouslySetInnerHTML.
const md = new MarkdownIt('zero', { html: false, breaks: true });
md.enable(['emphasis', 'backticks', 'list', 'newline']);

export function renderMarkdown(text: string): string {
  return md.render(text);
}
