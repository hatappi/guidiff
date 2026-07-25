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
