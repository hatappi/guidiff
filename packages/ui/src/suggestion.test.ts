import { expect, test } from 'bun:test';
import type { Hunk } from '@guidiff/schema';
import { newSideLines, suggestionLines } from './suggestion.ts';

const hunks: Hunk[] = [
  { header: '@@ -1,2 +1,3 @@', lines: [
    { type: 'context', oldLine: 1, newLine: 1, text: 'a' },
    { type: 'del', oldLine: 2, text: 'gone' },
    { type: 'add', newLine: 2, text: 'b' },
    { type: 'add', newLine: 3, text: 'c' },
  ] },
  { header: '@@ -10,1 +11,1 @@', lines: [
    { type: 'context', oldLine: 10, newLine: 11, text: 'far' },
  ] },
];

test('collects the new-side lines of a range, skipping deleted lines', () => {
  expect(newSideLines(hunks, 1, 3)).toEqual(['a', 'b', 'c']);
  expect(newSideLines(hunks, 2, 2)).toEqual(['b']);
});

test('returns null when the range is not fully covered by the diff', () => {
  // Lines 4..10 fall in the gap between the two hunks.
  expect(newSideLines(hunks, 3, 11)).toBeNull();
  expect(newSideLines(hunks, 4, 4)).toBeNull();
});

test('an empty suggestion renders as no lines (a deletion)', () => {
  expect(suggestionLines('')).toEqual([]);
  expect(suggestionLines('x\ny')).toEqual(['x', 'y']);
});
