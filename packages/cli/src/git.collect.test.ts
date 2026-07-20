import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDiff, getGitDir, getRepoRoot, resolveDiffSpec } from './git.ts';

function run(cwd: string, cmd: string[]) {
  const p = Bun.spawnSync(cmd, { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
  if (p.exitCode !== 0) throw new Error(new TextDecoder().decode(p.stderr));
}

let repo: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'guidiff-fixture-'));
  run(repo, ['git', 'init', '-b', 'main']);
  run(repo, ['git', 'config', 'user.email', 'test@example.com']);
  run(repo, ['git', 'config', 'user.name', 'test']);
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src/app.ts'), 'const a = 1;\nexport default a;\n');
  run(repo, ['git', 'add', '-A']);
  run(repo, ['git', 'commit', '-m', 'initial']);
  run(repo, ['git', 'branch', 'base']);
  // tracked change + untracked file (uncommitted)
  writeFileSync(join(repo, 'src/app.ts'), 'const a = 2;\nexport default a;\n');
  writeFileSync(join(repo, 'src/new.ts'), 'export const b = 1;\n');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('collectDiff', () => {
  test('worktree spec includes tracked changes and untracked files', async () => {
    const root = await getRepoRoot(repo);
    const files = await collectDiff(root, resolveDiffSpec(['.']));
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath['src/app.ts']!.status).toBe('modified');
    expect(byPath['src/new.ts']!.status).toBe('added');
    expect(byPath['src/new.ts']!.hunks[0]!.lines[0]).toEqual({
      type: 'add',
      newLine: 1,
      text: 'export const b = 1;',
    });
  });

  test('ref range diff works after committing', async () => {
    run(repo, ['git', 'add', '-A']);
    run(repo, ['git', 'commit', '-m', 'change']);
    const root = await getRepoRoot(repo);
    const files = await collectDiff(root, resolveDiffSpec(['base', 'main']));
    expect(files.map((f) => f.path).sort()).toEqual(['src/app.ts', 'src/new.ts']);
  });

  test('getGitDir returns .git path', async () => {
    const gitDir = await getGitDir(repo);
    expect(gitDir.endsWith('.git')).toBe(true);
  });
});
