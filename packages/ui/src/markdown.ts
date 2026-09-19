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

// Chat answers are full markdown (code fences, headings, links). html: false
// keeps model output inert when injected via dangerouslySetInnerHTML.
const chatMd = new MarkdownIt('commonmark', { html: false });
// Remote images would beacon out whatever a prompt-injected model writes
// into the URL (an <img> fires a cross-origin GET with no click), so images
// never render for an untrusted diff; the model's [text](url) still renders
// as a link, which needs a click to leak anything.
chatMd.disable('image');

export function renderChatMarkdown(text: string): string {
  return chatMd.render(text);
}
