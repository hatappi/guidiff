import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FileDiff, StateFile } from '@guidiff/schema';
import { loadState, patchHash, reconcileFiles, saveState, setViewed } from './state.ts';

const fileA: FileDiff = {
  path: 'src/a.ts', status: 'modified', binary: false, hunks: [], patch: 'diff --git a/src/a.ts ... v1',
};
const fileB: FileDiff = {
  path: 'src/b.ts', status: 'modified', binary: false, hunks: [], patch: 'diff --git a/src/b.ts ... v1',
};

test('patchHash is stable and prefixed', () => {
  expect(patchHash('x')).toBe(patchHash('x'));
  expect(patchHash('x')).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(patchHash('x')).not.toBe(patchHash('y'));
});

describe('reconcileFiles', () => {
  const now = new Date('2026-07-20T10:00:00+09:00');
  const viewedState: StateFile = setViewed({ version: 1, files: {} }, fileA, true, now);

  test('viewed + unchanged hash stays viewed', () => {
    const states = reconcileFiles(viewedState, [fileA, fileB]);
    expect(states.get('src/a.ts')).toEqual({
      viewed: true, changedSinceLastView: false, lastViewedAt: now.toISOString(),
    });
    expect(states.get('src/b.ts')).toEqual({ viewed: false, changedSinceLastView: false });
  });

  test('viewed + changed hash resets to unviewed with badge', () => {
    const changed: FileDiff = { ...fileA, patch: 'diff --git a/src/a.ts ... v2' };
    const states = reconcileFiles(viewedState, [changed]);
    expect(states.get('src/a.ts')).toEqual({
      viewed: false, changedSinceLastView: true, lastViewedAt: now.toISOString(),
    });
  });

  test('setViewed(false) removes the entry', () => {
    const cleared = setViewed(viewedState, fileA, false, now);
    expect(cleared.files['src/a.ts']).toBeUndefined();
  });
});

test('loadState returns empty state for missing file and round-trips saves', async () => {
  const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-state-'));
  expect(await loadState(gitDir)).toEqual({ version: 1, files: {} });
  const state = setViewed({ version: 1, files: {} }, fileA, true, new Date());
  await saveState(gitDir, state);
  expect(await loadState(gitDir)).toEqual(state);
});

test('loadState tolerates corrupt json', async () => {
  const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-state-'));
  await Bun.write(join(gitDir, 'guidiff/state.json'), '{not json');
  expect(await loadState(gitDir)).toEqual({ version: 1, files: {} });
});
