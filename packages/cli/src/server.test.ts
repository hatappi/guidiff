import { afterEach, describe, expect, test } from 'bun:test';
import type { FileDiff } from '@guidiff/schema';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState } from './state.ts';
import { startServer } from './server.ts';
import { VERSION } from './version.ts';
import type { ChatEvent, ChatProvider } from './ai/provider.ts';

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
    expect(payload.version).toBe(VERSION);
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

  test('file-level comment round-trips through post and submit without line fields', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, outcome } = boot(gitDir);

    const postRes = await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({ file: 'src/a.ts', body: 'file-level note' }),
    });
    expect(postRes.status).toBe(201);
    const created = await postRes.json();
    expect(created).toEqual({ id: created.id, file: 'src/a.ts', body: 'file-level note' });
    expect(created).not.toHaveProperty('side');
    expect(created).not.toHaveProperty('startLine');
    expect(created).not.toHaveProperty('endLine');

    const submitRes = await fetch(`${url}/api/submit`, {
      method: 'POST',
      body: JSON.stringify({ verdict: 'approve' }),
    });
    expect(submitRes.status).toBe(200);

    const out = await outcome;
    expect(out.type).toBe('submit');
    if (out.type === 'submit') {
      expect(out.result.comments).toEqual([
        { file: 'src/a.ts', body: 'file-level note' },
      ]);
    }
  });

  test('suggestion round-trips through post and submit', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, outcome } = boot(gitDir);

    const created = await (await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({
        file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1,
        body: 'prefer a const', suggestion: 'const a = 3;',
      }),
    })).json();
    expect(created.suggestion).toBe('const a = 3;');

    await fetch(`${url}/api/submit`, { method: 'POST', body: JSON.stringify({ verdict: 'request_changes' }) });
    const out = await outcome;
    if (out.type === 'submit') {
      expect(out.result.comments).toEqual([{
        file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1,
        body: 'prefer a const', suggestion: 'const a = 3;',
      }]);
    }
  });

  test('PATCH edits a suggestion, and null removes it while keeping the comment', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    const created = await (await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({
        file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'b', suggestion: 'old',
      }),
    })).json();

    const edited = await (await fetch(`${url}/api/comments/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: 'b2', suggestion: 'new' }),
    })).json();
    expect(edited).toEqual({ id: created.id, file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'b2', suggestion: 'new' });

    // Omitting suggestion leaves it untouched.
    const kept = await (await fetch(`${url}/api/comments/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: 'b3' }),
    })).json();
    expect(kept.suggestion).toBe('new');

    const cleared = await (await fetch(`${url}/api/comments/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: 'b4', suggestion: null }),
    })).json();
    expect(cleared).not.toHaveProperty('suggestion');
    expect(cleared.body).toBe('b4');
  });

  test('a suggestion-only comment with an empty body round-trips', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, outcome } = boot(gitDir);

    const postRes = await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({
        file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: '', suggestion: 'const a = 3;',
      }),
    });
    expect(postRes.status).toBe(201);
    const created = await postRes.json();

    // Emptying the body via PATCH is fine as long as the suggestion stays.
    const patchRes = await fetch(`${url}/api/comments/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: '', suggestion: 'const a = 4;' }),
    });
    expect(patchRes.status).toBe(200);

    await fetch(`${url}/api/submit`, { method: 'POST', body: JSON.stringify({ verdict: 'request_changes' }) });
    const out = await outcome;
    if (out.type === 'submit') {
      expect(out.result.comments).toEqual([{
        file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: '', suggestion: 'const a = 4;',
      }]);
    }
  });

  test('removing the last content from a comment returns 400', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    // Empty body without a suggestion is rejected outright.
    const postRes = await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({ file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: '' }),
    });
    expect(postRes.status).toBe(400);
    // So is a PATCH that empties the body while dropping the suggestion.
    const created = await (await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({
        file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: '', suggestion: 'const a = 3;',
      }),
    })).json();
    const res = await fetch(`${url}/api/comments/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: '', suggestion: null }),
    });
    expect(res.status).toBe(400);
  });

  test('PATCH adding a suggestion to a file-level comment returns 400', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    const created = await (await fetch(`${url}/api/comments`, {
      method: 'POST', body: JSON.stringify({ file: 'src/a.ts', body: 'file note' }),
    })).json();
    const res = await fetch(`${url}/api/comments/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: 'file note', suggestion: 'nope' }),
    });
    expect(res.status).toBe(400);
  });

  test('POST with a suggestion on a file-level comment returns 400', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    const res = await fetch(`${url}/api/comments`, {
      method: 'POST', body: JSON.stringify({ file: 'src/a.ts', body: 'x', suggestion: 'y' }),
    });
    expect(res.status).toBe(400);
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

function bootWithAi(gitDir: string, scripts: ChatEvent[][]) {
  const requests: Array<{ prompt: string; sessionId?: string; addDirs?: string[] }> = [];
  let release: (() => void) | null = null;
  const provider: ChatProvider = {
    async *ask(req) {
      requests.push({
        prompt: req.prompt,
        ...(req.sessionId ? { sessionId: req.sessionId } : {}),
        ...(req.addDirs ? { addDirs: req.addDirs } : {}),
      });
      for (const ev of scripts.shift() ?? []) {
        if (ev.type === 'delta' && ev.text === '<wait>') {
          // A conforming provider checks the signal before it waits: the
          // abort may already have fired while this generator was suspended.
          if (req.signal.aborted) return;
          await new Promise<void>((r) => {
            release = r;
            req.signal.addEventListener('abort', () => r(), { once: true });
          });
          if (req.signal.aborted) return;
          continue;
        }
        yield ev;
      }
    },
  };
  const handle = startServer({
    port: 0,
    target: 'working tree',
    guide: null,
    files,
    fileStates: new Map([['src/a.ts', { viewed: false, changedSinceLastView: false }]]),
    gitDir,
    state: { version: 1, files: {} },
    ai: { provider, cwd: '/repo', patchPath: '/repo/.git/guidiff/chat-diff-1.patch', isPullRequest: false },
  });
  stop = () => handle.server.stop(true);
  return { ...handle, requests, release: () => release?.() };
}

function parseSse(text: string): Array<{ event: string; data: unknown }> {
  return text.split('\n\n').filter(Boolean).map((block) => {
    const event = block.match(/^event: (.*)$/m)![1]!;
    const data = JSON.parse(block.match(/^data: (.*)$/m)![1]!);
    return { event, data };
  });
}

describe('chat api', () => {
  test('payload reports ai disabled and chat routes 404 without a provider', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = boot(gitDir);
    expect((await (await fetch(`${url}/api/review`)).json()).ai).toEqual({ enabled: false });
    expect((await fetch(`${url}/api/chat`)).status).toBe(404);
    expect((await fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"x"}' })).status).toBe(404);
  });

  test('a message streams deltas then a done event carrying the stored reply', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, requests } = bootWithAi(gitDir, [
      [{ type: 'delta', text: 'po' }, { type: 'delta', text: 'ng' }, { type: 'done', sessionId: 's1' }],
    ]);
    expect((await (await fetch(`${url}/api/review`)).json()).ai).toEqual({ enabled: true });

    const res = await fetch(`${url}/api/chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'why?', context: { file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, code: 'const a = 2;' } }),
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSse(await res.text());
    expect(events).toEqual([
      { event: 'delta', data: { text: 'po' } },
      { event: 'delta', data: { text: 'ng' } },
      { event: 'done', data: { message: { id: 2, role: 'assistant', content: 'pong', status: 'done' } } },
    ]);
    expect(requests[0]!.prompt).toContain('File: src/a.ts (new side, line 1)');
    expect(requests[0]!.addDirs).toEqual(['/repo/.git/guidiff']);

    const transcript = await (await fetch(`${url}/api/chat`)).json();
    expect(transcript.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(transcript.messages[0].context.file).toBe('src/a.ts');
  });

  test('rejects an empty or malformed body with 400', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = bootWithAi(gitDir, []);
    expect((await fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"   "}' })).status).toBe(400);
    expect((await fetch(`${url}/api/chat/messages`, { method: 'POST', body: 'nope' })).status).toBe(400);
  });

  test('a second message while streaming is 409; abort ends the first as aborted', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = bootWithAi(gitDir, [[{ type: 'delta', text: 'par' }, { type: 'delta', text: '<wait>' }]]);
    const first = fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"a"}' });
    // Wait until the first turn is registered before racing the second.
    await new Promise((r) => setTimeout(r, 50));
    expect((await fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"b"}' })).status).toBe(409);
    expect((await fetch(`${url}/api/chat/abort`, { method: 'POST' })).status).toBe(200);
    const events = parseSse(await (await first).text());
    expect(events.at(-1)).toEqual({ event: 'done', data: { message: { id: 2, role: 'assistant', content: 'par', status: 'aborted' } } });
  });

  test('clear empties the transcript', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = bootWithAi(gitDir, [[{ type: 'done', sessionId: 's1' }]]);
    await (await fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"a"}' })).text();
    expect((await fetch(`${url}/api/chat/clear`, { method: 'POST' })).status).toBe(200);
    expect((await (await fetch(`${url}/api/chat`)).json()).messages).toEqual([]);
  });

  test('dispose aborts an in-flight turn', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, dispose } = bootWithAi(gitDir, [[{ type: 'delta', text: '<wait>' }]]);
    const first = fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"a"}' });
    await new Promise((r) => setTimeout(r, 50));
    dispose();
    const events = parseSse(await (await first).text());
    expect(events.at(-1)!.event).toBe('done');
    expect((events.at(-1)!.data as { message: { status: string } }).message.status).toBe('aborted');
  });

  test('clear during an in-flight turn keeps the done frame well-formed', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = bootWithAi(gitDir, [[{ type: 'delta', text: '<wait>' }]]);
    const first = fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"a"}' });
    // Wait until the turn is registered before clearing out from under it.
    await new Promise((r) => setTimeout(r, 50));
    expect((await fetch(`${url}/api/chat/clear`, { method: 'POST' })).status).toBe(200);
    const events = parseSse(await (await first).text());
    const last = events.at(-1)!;
    expect(last.event).toBe('done');
    const message = (last.data as { message: { role: string; status: string } }).message;
    expect(message.role).toBe('assistant');
    expect(message.status).toBe('aborted');
    expect((await (await fetch(`${url}/api/chat`)).json()).messages).toEqual([]);
  });

  test('client disconnect aborts the turn', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url } = bootWithAi(gitDir, [[{ type: 'delta', text: '<wait>' }]]);
    const ac = new AbortController();
    const first = fetch(`${url}/api/chat/messages`, {
      method: 'POST', body: '{"content":"a"}', signal: ac.signal,
    });
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    // The local fetch promise rejects with our own AbortError; that's not
    // what this test is about, so swallow it and check the server's side.
    await first.catch(() => {});
    // Poll for the busy slot to clear: that's the observable evidence the
    // server's stream `cancel()` actually ran off the client disconnect.
    const deadline = Date.now() + 1000;
    let freed = false;
    while (Date.now() < deadline) {
      const res = await fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"b"}' });
      if (res.status === 200) {
        freed = true;
        await res.text();
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(freed).toBe(true);
    const transcript = await (await fetch(`${url}/api/chat`)).json();
    expect(transcript.messages[1].status).toBe('aborted');
  });

  // Deliberately spans Bun's 10s idle default: the first delta arrives after
  // 15s of real silence on the connection, reproducing the request timeout
  // that server.timeout(req, 0) is meant to prevent. Bun sweeps idle
  // connections on a coarse tick rather than the instant the default
  // elapses (measured: a request killed at ~12s wall-clock even though the
  // nominal default is 10s), so 15s leaves margin instead of racing the tick.
  test('the stream survives a 15 second silence before the first delta', async () => {
    const gitDir = mkdtempSync(join(tmpdir(), 'guidiff-srv-'));
    const { url, release } = bootWithAi(gitDir, [
      [{ type: 'delta', text: '<wait>' }, { type: 'delta', text: 'slow' }, { type: 'done', sessionId: 's1' }],
    ]);
    const first = fetch(`${url}/api/chat/messages`, { method: 'POST', body: '{"content":"a"}' });
    await new Promise((r) => setTimeout(r, 15_000));
    release();
    const events = parseSse(await (await first).text());
    expect(events).toEqual([
      { event: 'delta', data: { text: 'slow' } },
      { event: 'done', data: { message: { id: 2, role: 'assistant', content: 'slow', status: 'done' } } },
    ]);
  }, 20_000);
});
