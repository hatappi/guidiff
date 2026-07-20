import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
});
