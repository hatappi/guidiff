import { describe, expect, test } from 'bun:test';
import type { FileDiff } from '@guidiff/schema';
import { BusyError, buildPrompt, buildSystemPrompt, ChatSession } from './chat.ts';
import type { ChatEvent, ChatProvider, ChatRequest } from './provider.ts';

describe('buildPrompt', () => {
  test('no context: the question verbatim', () => {
    expect(buildPrompt('why?')).toBe('why?');
  });

  test('file-only context', () => {
    expect(buildPrompt('why?', { file: 'src/a.ts' })).toBe('File: src/a.ts\n\nwhy?');
  });

  test('line range with code', () => {
    expect(buildPrompt('why?', { file: 'src/a.ts', side: 'new', startLine: 12, endLine: 14, code: 'a\nb\nc' }))
      .toBe('File: src/a.ts (new side, lines 12-14)\n```\na\nb\nc\n```\n\nwhy?');
  });

  test('single old-side line', () => {
    expect(buildPrompt('why?', { file: 'src/a.ts', side: 'old', startLine: 3, endLine: 3, code: 'x' }))
      .toBe('File: src/a.ts (old side, line 3)\n```\nx\n```\n\nwhy?');
  });
});

describe('buildSystemPrompt', () => {
  const files: FileDiff[] = [
    { path: 'src/a.ts', status: 'modified', binary: false, hunks: [], patch: '' },
    { path: 'src/b.ts', status: 'added', binary: false, hunks: [], patch: '' },
  ];

  test('lists target, guide, files and the patch file', () => {
    const out = buildSystemPrompt({
      target: 'main..HEAD',
      guide: { version: 1, title: 'Auth', summary: 'Adds tokens.', sections: [] as never },
      files, patchPath: '/repo/.git/guidiff/chat-diff-1.patch', isPullRequest: false,
    });
    expect(out).toContain('main..HEAD');
    expect(out).toContain('Auth');
    expect(out).toContain('Adds tokens.');
    expect(out).toContain('- src/a.ts (modified)');
    expect(out).toContain('- src/b.ts (added)');
    expect(out).toContain('/repo/.git/guidiff/chat-diff-1.patch');
    expect(out).not.toContain('pull request');
  });

  test('omits the patch line when there is no patch file and warns for PR targets', () => {
    const out = buildSystemPrompt({ target: 'https://github.com/o/r/pull/1', guide: null, files, patchPath: null, isPullRequest: true });
    expect(out).not.toContain('.patch');
    expect(out).toContain('pull request');
  });
});

// Scripted provider: each ask() call plays the next script; `gate` lets a
// test hold a turn open to exercise busy/abort.
function scripted(scripts: ChatEvent[][]) {
  const requests: ChatRequest[] = [];
  let gate: (() => void) | null = null;
  const opened = new Promise<void>((r) => (gate = r));
  const provider: ChatProvider = {
    async *ask(req) {
      requests.push(req);
      const script = scripts.shift() ?? [];
      for (const ev of script) {
        if (ev.type === 'delta' && ev.text === '<wait>') {
          // A conforming provider checks the signal before waiting on it: an
          // 'abort' listener registered after abort() already fired never runs.
          if (req.signal.aborted) return;
          await Promise.race([opened, new Promise<void>((r) => req.signal.addEventListener('abort', () => r(), { once: true }))]);
          if (req.signal.aborted) return;
          continue;
        }
        yield ev;
      }
    },
  };
  return { provider, requests, open: () => gate?.() };
}

async function drain(it: AsyncIterable<ChatEvent>) {
  for await (const _ of it) { /* consume */ }
}

describe('ChatSession', () => {
  const opts = (provider: ChatProvider) => ({ provider, cwd: '/repo', addDirs: ['/repo/.git/guidiff'], systemPrompt: 'SYS' });

  test('a turn records user and assistant messages and resumes the session next time', async () => {
    const s = scripted([
      [{ type: 'delta', text: 'po' }, { type: 'delta', text: 'ng' }, { type: 'done', sessionId: 's1' }],
      [{ type: 'delta', text: 'again' }, { type: 'done', sessionId: 's1' }],
    ]);
    const session = new ChatSession(opts(s.provider));
    await drain(session.send('why?', { file: 'src/a.ts' }));
    expect(session.messages()).toEqual([
      { id: 1, role: 'user', content: 'why?', context: { file: 'src/a.ts' }, status: 'done' },
      { id: 2, role: 'assistant', content: 'pong', status: 'done' },
    ]);
    expect(s.requests[0]!.sessionId).toBeUndefined();
    expect(s.requests[0]!.prompt).toBe('File: src/a.ts\n\nwhy?');
    expect(s.requests[0]!.systemPrompt).toBe('SYS');
    expect(s.requests[0]!.cwd).toBe('/repo');
    expect(s.requests[0]!.addDirs).toEqual(['/repo/.git/guidiff']);

    await drain(session.send('more'));
    expect(s.requests[1]!.sessionId).toBe('s1');
    expect(session.messages()[3]).toEqual({ id: 4, role: 'assistant', content: 'again', status: 'done' });
  });

  test('a provider error marks the assistant message as error', async () => {
    const s = scripted([[{ type: 'delta', text: 'par' }, { type: 'error', message: 'boom' }]]);
    const session = new ChatSession(opts(s.provider));
    await drain(session.send('why?'));
    expect(session.messages()[1]).toEqual({ id: 2, role: 'assistant', content: 'par', status: 'error', error: 'boom' });
    expect(session.busy()).toBe(false);
  });

  test('a stream that ends without done is an error, not a silent success', async () => {
    const s = scripted([[{ type: 'delta', text: 'x' }]]);
    const session = new ChatSession(opts(s.provider));
    await drain(session.send('why?'));
    expect(session.messages()[1]!.status).toBe('error');
  });

  test('send while busy throws BusyError; abort ends the turn as aborted', async () => {
    const s = scripted([[{ type: 'delta', text: 'par' }, { type: 'delta', text: '<wait>' }, { type: 'done', sessionId: 's1' }]]);
    const session = new ChatSession(opts(s.provider));
    const it = session.send('why?')[Symbol.asyncIterator]();
    await it.next();
    expect(session.busy()).toBe(true);
    expect(() => session.send('again')).toThrow(BusyError);
    session.abort();
    for (let r = await it.next(); !r.done; r = await it.next()) { /* drain */ }
    expect(session.messages()[1]).toEqual({ id: 2, role: 'assistant', content: 'par', status: 'aborted' });
    expect(session.busy()).toBe(false);
  });

  test('abort releases the slot immediately, so sending again right after does not throw', async () => {
    const s = scripted([
      [{ type: 'delta', text: 'par' }, { type: 'delta', text: '<wait>' }, { type: 'done', sessionId: 's1' }],
      [{ type: 'done', sessionId: 's2' }],
    ]);
    const session = new ChatSession(opts(s.provider));
    const first = session.send('why?')[Symbol.asyncIterator]();
    await first.next();
    session.abort();

    let second: AsyncIterable<ChatEvent> | undefined;
    expect(() => {
      second = session.send('again');
    }).not.toThrow();
    expect(session.busy()).toBe(true);

    for (let r = await first.next(); !r.done; r = await first.next()) { /* drain */ }
    await drain(second!);
    expect(session.messages()[1]!.status).toBe('aborted');
    expect(session.messages()[3]!.status).toBe('done');
  });

  test('clear drops messages and the provider session', async () => {
    const s = scripted([
      [{ type: 'done', sessionId: 's1' }],
      [{ type: 'done', sessionId: 's2' }],
    ]);
    const session = new ChatSession(opts(s.provider));
    await drain(session.send('a'));
    session.clear();
    expect(session.messages()).toEqual([]);
    await drain(session.send('b'));
    expect(s.requests[1]!.sessionId).toBeUndefined();
    expect(session.messages()[0]!.id).toBe(1);
  });

  test('clear releases the slot immediately too, so sending again right after does not throw', async () => {
    const s = scripted([
      [{ type: 'delta', text: 'par' }, { type: 'delta', text: '<wait>' }, { type: 'done', sessionId: 's1' }],
      [{ type: 'done', sessionId: 's2' }],
    ]);
    const session = new ChatSession(opts(s.provider));
    const first = session.send('why?')[Symbol.asyncIterator]();
    await first.next();
    session.clear();

    let second: AsyncIterable<ChatEvent> | undefined;
    expect(() => {
      second = session.send('again');
    }).not.toThrow();
    expect(session.busy()).toBe(true);

    for (let r = await first.next(); !r.done; r = await first.next()) { /* drain */ }
    await drain(second!);
    expect(session.messages()).toHaveLength(2);
    expect(session.messages()[1]!.status).toBe('done');
  });
});
