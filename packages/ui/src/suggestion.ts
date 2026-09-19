import type { Hunk } from '@guidiff/schema';

/**
 * Text of the post-change lines `start..end`, in order.
 *
 * Returns null when the range is not fully present in the diff (a gap between
 * hunks, or a selection on the old side): a suggestion has to replace an exact,
 * contiguous slice of the new file, so a partial range is not suggestable.
 */
export function newSideLines(hunks: Hunk[], start: number, end: number): string[] | null {
  const byLine = new Map<number, string>();
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.newLine !== undefined && line.newLine >= start && line.newLine <= end) {
        byLine.set(line.newLine, line.text);
      }
    }
  }
  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    const text = byLine.get(n);
    if (text === undefined) return null;
    out.push(text);
  }
  return out;
}

/** Suggestion text as rendered lines; an empty suggestion deletes the range. */
export const suggestionLines = (suggestion: string): string[] =>
  suggestion === '' ? [] : suggestion.split('\n');

/**
 * Text of the lines `start..end` on one side, in order, for quoting to the
 * chat. Unlike newSideLines a partial range is fine: whatever the diff shows
 * is still useful context.
 */
export function sideLines(hunks: Hunk[], side: 'new' | 'old', start: number, end: number): string[] {
  const byLine = new Map<number, string>();
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      const n = side === 'new' ? line.newLine : line.oldLine;
      if (n !== undefined && n >= start && n <= end) byLine.set(n, line.text);
    }
  }
  return [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text);
}
