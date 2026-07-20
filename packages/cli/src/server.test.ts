import { afterEach, describe, expect, test } from 'bun:test';
import type { FileDiff } from '@guidiff/schema';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState } from './state.ts';
import { startServer } from './server.ts';

const files: FileDiff[] = [
  {
    path: 'src/a.ts', status: 'modified', binary: false,
    hunks: [{ header: '@@ -1,1 +1,1 @@', lines: [{ type: 'add', newLine: 1, text: 'const a = 2;' }] }],
    patch: 'diff --git a/src/a.ts ...',
  },
];

let stop: (() => void) | null = null;
afterEach(() => stop?.());

function boot(gitDir: string) {
  const handle = startServer({
    port: 0,
    target: 'working tree',
    guide: null,
    files,
    fileStates: new Map([['src/a.ts', { viewed: false, changedSinceLastView: false }]]),
    gitDir,
    state: { version: 1, files: {} },
  });
  stop = () => handle.server.stop(true);
  return handle;
}

describe('review api', () => {
  test('GET /api/review returns payload', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    const res = await fetch(`${url}/api/review`);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.target).toBe('working tree');
    expect(payload.files[0].path).toBe('src/a.ts');
    expect(payload.files[0].state.viewed).toBe(false);
    expect(payload.comments).toEqual([]);
  });

  test('comment CRUD and submit produce a result and resolve outcome', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, outcome } = boot(gitDir);

    const created = await (await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({ file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'why 2?' }),
    })).json();
    expect(created.id).toBe(1);

    await fetch(`${url}/api/comments/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: 'why 2? (edited)' }),
    });

    const second = await (await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({ file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'delete me' }),
    })).json();
    await fetch(`${url}/api/comments/${second.id}`, { method: 'DELETE' });

    const submitRes = await fetch(`${url}/api/submit`, {
      method: 'POST',
      body: JSON.stringify({ verdict: 'request_changes', overallComment: 'overall' }),
    });
    expect(submitRes.status).toBe(200);

    const out = await outcome;
    expect(out.type).toBe('submit');
    if (out.type === 'submit') {
      expect(out.result.verdict).toBe('request_changes');
      expect(out.result.comments).toEqual([
        { file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'why 2? (edited)' },
      ]);
    }
  });

  test('PUT /api/files/viewed persists state to gitDir', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    const res = await fetch(`${url}/api/files/viewed`, {
      method: 'PUT', body: JSON.stringify({ path: 'src/a.ts', viewed: true }),
    });
    expect(res.status).toBe(200);
    const saved = await loadState(gitDir);
    expect(saved.files['src/a.ts']?.viewed).toBe(true);
  });

  test('POST /api/cancel resolves outcome with cancel', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, outcome } = boot(gitDir);
    await fetch(`${url}/api/cancel`, { method: 'POST' });
    expect((await outcome).type).toBe('cancel');
  });

  test('invalid comment body returns 400', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    const res = await fetch(`${url}/api/comments`, { method: 'POST', body: JSON.stringify({ file: '' }) });
    expect(res.status).toBe(400);
  });
});
