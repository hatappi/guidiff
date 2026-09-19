import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, 'index.ts');

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'guidiff-e2e-'));
  const run = (cmd: string[]) => {
    const p = Bun.spawnSync(cmd, { cwd: repo });
    if (p.exitCode !== 0) throw new Error(new TextDecoder().decode(p.stderr));
  };
  run(['git', 'init', '-b', 'main']);
  run(['git', 'config', 'user.email', 't@e.com']);
  run(['git', 'config', 'user.name', 't']);
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  run(['git', 'add', '-A']);
  run(['git', 'commit', '-m', 'init']);
  writeFileSync(join(repo, 'a.txt'), 'two\n');
  return repo;
}

async function readUrlFromStderr(proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>): Promise<string> {
  const reader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value);
    const m = buf.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
    if (m) {
      reader.releaseLock();
      return m[1]!;
    }
  }
  throw new Error(`server url not found in stderr: ${buf}`);
}

describe('guidiff e2e', () => {
  test('submit flow: stdout is exactly the result json, exit 0', async () => {
    const repo = makeRepo();
    const proc = Bun.spawn(['bun', CLI, '.', '--no-open'], {
      cwd: repo, stdout: 'pipe', stderr: 'pipe',
    });
    const url = await readUrlFromStderr(proc);

    await fetch(`${url}/api/comments`, {
      method: 'POST',
      body: JSON.stringify({ file: 'a.txt', side: 'new', startLine: 1, endLine: 1, body: 'nice' }),
    });
    await fetch(`${url}/api/submit`, {
      method: 'POST',
      body: JSON.stringify({ verdict: 'approve' }),
    });

    expect(await proc.exited).toBe(0);
    const stdout = await new Response(proc.stdout).text();
    const result = JSON.parse(stdout); // throws if stdout has anything but JSON
    expect(result.verdict).toBe('approve');
    expect(result.comments).toHaveLength(1);
  });

  test('cancel flow: empty stdout, exit 2', async () => {
    const repo = makeRepo();
    const proc = Bun.spawn(['bun', CLI, '.', '--no-open'], { cwd: repo, stdout: 'pipe', stderr: 'pipe' });
    const url = await readUrlFromStderr(proc);
    await fetch(`${url}/api/cancel`, { method: 'POST' });
    expect(await proc.exited).toBe(2);
    expect(await new Response(proc.stdout).text()).toBe('');
  });

  test('no changes: exit 1', async () => {
    const repo = makeRepo();
    Bun.spawnSync(['git', 'add', '-A'], { cwd: repo });
    Bun.spawnSync(['git', 'commit', '-m', 'clean'], { cwd: repo });
    const proc = Bun.spawn(['bun', CLI, '.', '--no-open'], { cwd: repo, stdout: 'pipe', stderr: 'pipe' });
    expect(await proc.exited).toBe(1);
  });

  test('invalid guide json: exit 1 with validation message', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, 'guide.json'), JSON.stringify({ version: 1 }));
    const proc = Bun.spawn(['bun', CLI, '.', '--guide', 'guide.json', '--no-open'], {
      cwd: repo, stdout: 'pipe', stderr: 'pipe',
    });
    expect(await proc.exited).toBe(1);
    expect(await new Response(proc.stderr).text()).toContain('invalid guide JSON');
  });

  test('malformed guide json (not parseable): exit 1 with validation message', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, 'guide.json'), '{not json');
    const proc = Bun.spawn(['bun', CLI, '.', '--guide', 'guide.json', '--no-open'], {
      cwd: repo, stdout: 'pipe', stderr: 'pipe',
    });
    expect(await proc.exited).toBe(1);
    expect(await new Response(proc.stderr).text()).toContain('invalid guide JSON');
    expect(await new Response(proc.stdout).text()).toBe('');
  });

  test('--no-ai reports the chat as disabled and 404s the chat routes', async () => {
    const repo = makeRepo();
    const proc = Bun.spawn([process.execPath, CLI, '--no-open', '--no-ai'], {
      cwd: repo, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe',
    });
    const url = await readUrlFromStderr(proc);
    const payload = await (await fetch(`${url}/api/review`)).json();
    expect(payload.ai).toEqual({ enabled: false });
    expect((await fetch(`${url}/api/chat`)).status).toBe(404);
    await fetch(`${url}/api/cancel`, { method: 'POST' });
    expect(await proc.exited).toBe(2);
  });

  test('with the chat enabled the diff is written to a patch file and removed on exit', async () => {
    const repo = makeRepo();
    // A fake `claude` on PATH is enough for detection; it is never run here.
    const bin = mkdtempSync(join(tmpdir(), 'guidiff-bin-'));
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const proc = Bun.spawn([process.execPath, CLI, '--no-open'], {
      cwd: repo, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const url = await readUrlFromStderr(proc);
    expect((await (await fetch(`${url}/api/review`)).json()).ai).toEqual({ enabled: true });
    const patches = readdirSync(join(repo, '.git', 'guidiff')).filter((f) => f.startsWith('chat-diff-'));
    expect(patches.length).toBe(1);
    expect(readFileSync(join(repo, '.git', 'guidiff', patches[0]!), 'utf8')).toContain('a.txt');
    await fetch(`${url}/api/cancel`, { method: 'POST' });
    expect(await proc.exited).toBe(2);
    expect(readdirSync(join(repo, '.git', 'guidiff')).filter((f) => f.startsWith('chat-diff-'))).toEqual([]);
  });
});
