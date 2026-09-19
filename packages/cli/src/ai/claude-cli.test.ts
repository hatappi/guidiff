import { describe, expect, test } from 'bun:test';
import { buildClaudeArgs, ClaudeCliProvider, parseStreamLine, type SpawnFn } from './claude-cli.ts';
import type { ChatEvent } from './provider.ts';

// Shapes recorded from `claude 2.1.277 -p --output-format stream-json --verbose --include-partial-messages`.
const INIT = '{"type":"system","subtype":"init","cwd":"/repo","session_id":"s1","tools":["Read"]}';
const HOOK = '{"type":"system","subtype":"hook_started","hook_name":"SessionStart:startup","session_id":"s1"}';
const THINK = '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hm"}},"session_id":"s1"}';
const TEXT_A = '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"po"}},"session_id":"s1"}';
const TEXT_B = '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"ng"}},"session_id":"s1"}';
const SNAPSHOT = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"pong"}]},"session_id":"s1"}';
const RESULT = '{"type":"result","subtype":"success","is_error":false,"result":"pong","session_id":"s1"}';
const RESULT_ERR = '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"boom","session_id":"s1"}';

describe('parseStreamLine', () => {
  test('text deltas become delta events', () => {
    expect(parseStreamLine(TEXT_A)).toEqual({ type: 'delta', text: 'po' });
  });

  test('the result line becomes done with the session id', () => {
    expect(parseStreamLine(RESULT)).toEqual({ type: 'done', sessionId: 's1' });
  });

  test('an is_error result becomes an error event', () => {
    expect(parseStreamLine(RESULT_ERR)).toEqual({ type: 'error', message: 'boom' });
  });

  test('init, hook, thinking, snapshot and garbage lines are ignored', () => {
    for (const line of [INIT, HOOK, THINK, SNAPSHOT, '', 'not json', '[]', '42']) {
      expect(parseStreamLine(line)).toBeNull();
    }
  });
});

describe('buildClaudeArgs', () => {
  const base = { prompt: 'why?', systemPrompt: 'SYS', cwd: '/repo', signal: new AbortController().signal };

  test('first turn: print mode, restricted read-only tools, streaming, system prompt; prompt is NOT an argument', () => {
    expect(buildClaudeArgs(base)).toEqual([
      '-p',
      '--restricted', '--strict-mcp-config', '--tools', 'Read,Grep,Glob',
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--append-system-prompt', 'SYS',
    ]);
  });

  test('extra readable directories and a resumed session are appended', () => {
    const args = buildClaudeArgs({ ...base, addDirs: ['/repo/.git/guidiff'], sessionId: 's1' });
    expect(args.slice(-4)).toEqual(['--add-dir', '/repo/.git/guidiff', '--resume', 's1']);
  });
});

function fakeSpawn(lines: string[], opts: { exitCode?: number; stderr?: string; chunked?: boolean } = {}) {
  const calls: Array<{ cmd: string[]; cwd: string; stdin: string }> = [];
  let killed = false;
  const spawn: SpawnFn = (cmd, { cwd, stdin }) => {
    calls.push({ cmd, cwd, stdin });
    const text = lines.join('\n') + '\n';
    // Optionally split mid-line to prove the line reader buffers across chunks.
    const parts = opts.chunked ? [text.slice(0, 7), text.slice(7)] : [text];
    const enc = new TextEncoder();
    const stdout = new ReadableStream<Uint8Array>({
      start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); },
    });
    const stderr = new Response(opts.stderr ?? '').body!;
    return { stdout, stderr, exited: Promise.resolve(opts.exitCode ?? 0), kill: () => { killed = true; } };
  };
  return { spawn, calls, killed: () => killed };
}

async function collect(it: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe('ClaudeCliProvider', () => {
  const req = { prompt: 'why?', systemPrompt: 'SYS', cwd: '/repo', signal: new AbortController().signal };

  test('yields deltas then done, spawning claude in the repo root', async () => {
    const f = fakeSpawn([INIT, HOOK, THINK, TEXT_A, TEXT_B, SNAPSHOT, RESULT], { chunked: true });
    const provider = new ClaudeCliProvider(f.spawn);
    expect(await collect(provider.ask(req))).toEqual([
      { type: 'delta', text: 'po' }, { type: 'delta', text: 'ng' }, { type: 'done', sessionId: 's1' },
    ]);
    expect(f.calls[0]!.cwd).toBe('/repo');
    expect(f.calls[0]!.cmd[0]).toBe('claude');
    // The prompt travels on stdin: no ARG_MAX ceiling, and a question that
    // starts with "-" can never be parsed as a flag.
    expect(f.calls[0]!.stdin).toBe('why?');
    expect(f.calls[0]!.cmd).not.toContain('why?');
  });

  test('a non-zero exit without a result line yields an error with the stderr tail', async () => {
    const f = fakeSpawn([INIT], { exitCode: 1, stderr: 'line1\nfatal: nope\n' });
    const events = await collect(new ClaudeCliProvider(f.spawn).ask(req));
    expect(events).toEqual([{ type: 'error', message: 'claude exited with code 1: line1\nfatal: nope' }]);
  });

  test('abort kills the process and ends the stream without an error event', async () => {
    const controller = new AbortController();
    const f = fakeSpawn([TEXT_A], { exitCode: 143 });
    const it = new ClaudeCliProvider(f.spawn).ask({ ...req, signal: controller.signal })[Symbol.asyncIterator]();
    expect((await it.next()).value).toEqual({ type: 'delta', text: 'po' });
    controller.abort();
    const rest: ChatEvent[] = [];
    for (let r = await it.next(); !r.done; r = await it.next()) rest.push(r.value);
    expect(rest).toEqual([]);
    expect(f.killed()).toBe(true);
  });

  test('a spawn that throws synchronously (e.g. ENOENT) yields an error event instead of rejecting', async () => {
    const spawn: SpawnFn = () => { throw new Error('ENOENT'); };
    const events = await collect(new ClaudeCliProvider(spawn).ask(req));
    expect(events).toEqual([{ type: 'error', message: 'could not start claude: ENOENT' }]);
  });
});
