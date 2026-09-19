import type { ChatEvent, ChatProvider, ChatRequest } from './provider.ts';

export interface SpawnedProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(): void;
}

export type SpawnFn = (cmd: string[], opts: { cwd: string; stdin: string }) => SpawnedProcess;

// stdout/stderr are always piped: the CLI's own stdout carries the review
// result JSON and must never receive subprocess output.
export const bunSpawn: SpawnFn = (cmd, { cwd, stdin }) => {
  const proc = Bun.spawn(cmd, { cwd, stdin: new Blob([stdin]), stdout: 'pipe', stderr: 'pipe' });
  return { stdout: proc.stdout, stderr: proc.stderr, exited: proc.exited, kill: () => proc.kill() };
};

export const READ_ONLY_TOOLS = 'Read,Grep,Glob';

// --restricted + --strict-mcp-config drop the user's settings, hooks and MCP
// servers: the model gets exactly Read/Grep/Glob and a ~5K-token system
// prompt instead of ~52K. The prompt itself is piped on stdin.
export function buildClaudeArgs(req: ChatRequest): string[] {
  return [
    '-p',
    '--restricted', '--strict-mcp-config', '--tools', READ_ONLY_TOOLS,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--append-system-prompt', req.systemPrompt,
    ...(req.addDirs ?? []).flatMap((d) => ['--add-dir', d]),
    ...(req.sessionId ? ['--resume', req.sessionId] : []),
  ];
}

// One line of `--output-format stream-json`. Only text deltas and the final
// result matter; hooks, init, thinking and per-message snapshots are noise.
export function parseStreamLine(line: string): ChatEvent | null {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
  const m = msg as Record<string, unknown>;
  if (m.type === 'stream_event') {
    const event = m.event as { type?: string; delta?: { type?: string; text?: unknown } } | undefined;
    if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
      return { type: 'delta', text: event.delta.text };
    }
    return null;
  }
  if (m.type === 'result') {
    if (m.is_error) {
      const text = typeof m.result === 'string' ? m.result : typeof m.error === 'string' ? m.error : 'claude returned an error';
      return { type: 'error', message: text };
    }
    return { type: 'done', sessionId: typeof m.session_id === 'string' ? m.session_id : '' };
  }
  return null;
}

async function* lines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        yield buf.slice(0, nl);
        buf = buf.slice(nl + 1);
      }
    }
    if (buf !== '') yield buf;
  } finally {
    reader.releaseLock();
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  try {
    return await new Response(stream).text();
  } catch {
    return '';
  }
}

export class ClaudeCliProvider implements ChatProvider {
  constructor(private readonly spawn: SpawnFn = bunSpawn, private readonly bin = 'claude') {}

  async *ask(req: ChatRequest): AsyncIterable<ChatEvent> {
    if (req.signal.aborted) return;
    const proc = this.spawn([this.bin, ...buildClaudeArgs(req)], { cwd: req.cwd, stdin: req.prompt });
    const onAbort = () => proc.kill();
    req.signal.addEventListener('abort', onAbort, { once: true });
    const stderr = readAll(proc.stderr);
    let finished = false;
    try {
      for await (const line of lines(proc.stdout)) {
        const ev = parseStreamLine(line);
        if (!ev) continue;
        if (ev.type !== 'delta') finished = true;
        yield ev;
      }
      const code = await proc.exited;
      if (!finished && !req.signal.aborted) {
        const tail = (await stderr).trim().split('\n').slice(-5).join('\n');
        yield { type: 'error', message: `claude exited with code ${code}${tail ? `: ${tail}` : ''}` };
      }
    } finally {
      req.signal.removeEventListener('abort', onAbort);
      // The consumer may stop early (client disconnect); never leave the
      // subprocess running.
      proc.kill();
    }
  }
}
