import type { HighlighterCore } from 'shiki';
import type { Theme } from './theme.ts';

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', json: 'json',
  go: 'go', py: 'python', rb: 'ruby', rs: 'rust', sh: 'shellscript', bash: 'shellscript',
  css: 'css', html: 'html', md: 'markdown', yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql',
};

const SHIKI_THEME: Record<Theme, string> = { light: 'github-light', dark: 'github-dark' };

let highlighterPromise: Promise<HighlighterCore> | null = null;

async function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= import('shiki').then((shiki) =>
    shiki.createHighlighter({
      themes: Object.values(SHIKI_THEME),
      langs: Object.values(LANG_BY_EXT),
    }),
  );
  return highlighterPromise;
}

export function langFor(filePath: string): string | null {
  const ext = filePath.split('.').pop() ?? '';
  return LANG_BY_EXT[ext] ?? null;
}

/** Returns HTML for a single line of code, or null when no grammar applies. */
export async function highlightLine(
  text: string,
  filePath: string,
  theme: Theme = 'light',
): Promise<string | null> {
  const lang = langFor(filePath);
  if (!lang || text === '') return null;
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(text, { lang, theme: SHIKI_THEME[theme], structure: 'inline' });
}
