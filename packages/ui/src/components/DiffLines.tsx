import { useEffect, useState } from 'react';
import { highlightLine } from '../highlight.ts';
import { useTheme } from '../theme-context.tsx';

export function CodeCell({ text, filePath }: { text: string; filePath: string }) {
  const { theme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    highlightLine(text, filePath, theme).then((h) => alive && setHtml(h)).catch(() => {});
    return () => { alive = false; };
  }, [text, filePath, theme]);
  if (html) return <span className="code-inner" dangerouslySetInnerHTML={{ __html: html }} />;
  return <span className="code-inner">{text}</span>;
}
