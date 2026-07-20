import type { FileDiff, Hunk } from '@guidiff/schema';

export type DiffSpec = { kind: 'worktree' } | { kind: 'range'; args: string[]; label: string };

export function resolveDiffSpec(positionals: string[]): DiffSpec {
  const args = positionals.filter((p) => p !== '');
  if (args.length === 0 || (args.length === 1 && args[0] === '.')) {
    return { kind: 'worktree' };
  }
  if (args.length === 2) {
    return { kind: 'range', args, label: `${args[0]}..${args[1]}` };
  }
  const single = args[0]!;
  const label = single.includes('..') ? single : `${single}..(working tree)`;
  return { kind: 'range', args: [single], label };
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(text: string): FileDiff[] {
  if (text.trim() === '') return [];
  const files: FileDiff[] = [];
  // Split keeping each chunk's "diff --git " prefix for the raw patch.
  const chunks = text.split(/^(?=diff --git )/m).filter((c) => c.startsWith('diff --git '));

  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    const header = lines[0]!;
    const m = header.match(/^diff --git (?:"?a\/(.+?)"?) (?:"?b\/(.+?)"?)$/);
    if (!m) continue;
    let path = m[2]!;
    let oldPath: string | undefined;
    let status: FileDiff['status'] = 'modified';
    let binary = false;

    let i = 1;
    while (i < lines.length && !lines[i]!.startsWith('@@')) {
      const l = lines[i]!;
      if (l.startsWith('new file mode')) status = 'added';
      else if (l.startsWith('deleted file mode')) status = 'deleted';
      else if (l.startsWith('rename from ')) oldPath = l.slice('rename from '.length);
      else if (l.startsWith('rename to ')) {
        status = 'renamed';
        path = l.slice('rename to '.length);
      } else if (l.startsWith('Binary files ') || l.startsWith('GIT binary patch')) binary = true;
      i++;
    }

    const hunks: Hunk[] = [];
    let current: Hunk | null = null;
    let oldLine = 0;
    let newLine = 0;
    for (; i < lines.length; i++) {
      const l = lines[i]!;
      const hm = l.match(HUNK_RE);
      if (hm) {
        current = { header: l.match(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/)![0]!, lines: [] };
        oldLine = Number(hm[1]);
        newLine = Number(hm[2]);
        hunks.push(current);
        continue;
      }
      if (!current) continue;
      if (l.startsWith('+')) {
        current.lines.push({ type: 'add', newLine: newLine++, text: l.slice(1) });
      } else if (l.startsWith('-')) {
        current.lines.push({ type: 'del', oldLine: oldLine++, text: l.slice(1) });
      } else if (l.startsWith(' ')) {
        current.lines.push({ type: 'context', oldLine: oldLine++, newLine: newLine++, text: l.slice(1) });
      }
      // "\ No newline at end of file" and blank tail lines are ignored.
    }

    files.push({ path, oldPath, status, binary, hunks, patch: chunk.replace(/\n$/, '') });
  }
  return files;
}

async function git(repoRoot: string, args: string[], allowExit1 = false): Promise<string> {
  const proc = Bun.spawn(['git', '-C', repoRoot, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0 && !(allowExit1 && code === 1)) {
    throw new Error(`git ${args.join(' ')} failed (exit ${code}): ${err.trim()}`);
  }
  return out;
}

export async function getRepoRoot(cwd: string): Promise<string> {
  return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim();
}

export async function getGitDir(cwd: string): Promise<string> {
  return (await git(cwd, ['rev-parse', '--absolute-git-dir'])).trim();
}

const DIFF_BASE_ARGS = ['diff', '--no-color', '--unified=3', '--find-renames'];

export async function collectDiff(repoRoot: string, spec: DiffSpec): Promise<FileDiff[]> {
  if (spec.kind === 'range') {
    return parseUnifiedDiff(await git(repoRoot, [...DIFF_BASE_ARGS, ...spec.args]));
  }
  // worktree: staged + unstaged vs HEAD, plus untracked files
  const tracked = parseUnifiedDiff(await git(repoRoot, [...DIFF_BASE_ARGS, 'HEAD']));
  const untrackedList = (await git(repoRoot, ['ls-files', '--others', '--exclude-standard']))
    .split('\n')
    .filter((p) => p !== '');
  const untracked: FileDiff[] = [];
  for (const path of untrackedList) {
    // git diff --no-index exits 1 when files differ; that's expected.
    const patch = await git(repoRoot, [...DIFF_BASE_ARGS, '--no-index', '--', '/dev/null', path], true);
    for (const f of parseUnifiedDiff(patch)) {
      untracked.push({ ...f, path, status: 'added', oldPath: undefined });
    }
  }
  return [...tracked, ...untracked];
}
