import { expect, test } from 'bun:test';
import type { Hunk } from '@guidiff/schema';
import { buildSplitRows } from './split.ts';

test('pairs del/add runs side by side', () => {
  const hunk: Hunk = {
    header: '@@ -1,3 +1,3 @@',
    lines: [
      { type: 'context', oldLine: 1, newLine: 1, text: 'keep' },
      { type: 'del', oldLine: 2, text: 'old1' },
      { type: 'del', oldLine: 3, text: 'old2' },
      { type: 'add', newLine: 2, text: 'new1' },
      { type: 'context', oldLine: 4, newLine: 3, text: 'tail' },
    ],
  };
  expect(buildSplitRows(hunk)).toEqual([
    { left: { type: 'context', oldLine: 1, newLine: 1, text: 'keep' }, right: { type: 'context', oldLine: 1, newLine: 1, text: 'keep' } },
    { left: { type: 'del', oldLine: 2, text: 'old1' }, right: { type: 'add', newLine: 2, text: 'new1' } },
    { left: { type: 'del', oldLine: 3, text: 'old2' }, right: undefined },
    { left: { type: 'context', oldLine: 4, newLine: 3, text: 'tail' }, right: { type: 'context', oldLine: 4, newLine: 3, text: 'tail' } },
  ]);
});
