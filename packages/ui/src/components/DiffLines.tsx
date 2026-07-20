import { useEffect, useState } from 'react';
import { highlightLine } from '../highlight.ts';

export function CodeCell({ text, filePath }: { text: string; filePath: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    highlightLine(text, filePath).then((h) => alive && setHtml(h)).catch(() => {});
    return () => { alive = false; };
  }, [text, filePath]);
  if (html) return <span className="code-inner" dangerouslySetInnerHTML={{ __html: html }} />;
  return <span className="code-inner">{text}</span>;
}
