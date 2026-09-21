#!/usr/bin/env bun
import { GuideSchema, type Guide } from '@guidiff/schema';
import indexHtml from '@guidiff/ui/index.html';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeCliProvider } from './ai/claude-cli.ts';
import { HelpRequested, parseCliArgs, USAGE, VersionRequested } from './cli-args.ts';
import { VERSION } from './version.ts';
import { collectDiff, type DiffSpec, getGitDir, getRepoName, getRepoRoot, resolveDiffSpec } from './git.ts';
import { startServer } from './server.ts';
import { loadState, reconcileFiles } from './state.ts';

const log = (msg: string) => console.error(msg); // stderr only; stdout is reserved for the result JSON

async function main(): Promise<number> {
  let opts;
  try {
    opts = parseCliArgs(Bun.argv.slice(2));
  } catch (e) {
    if (e instanceof HelpRequested) {
      log(USAGE);
      return 0;
    }
    if (e instanceof VersionRequested) {
      // stdout is safe here: --version exits before any review starts,
      // so it cannot collide with the result JSON.
      console.log(VERSION);
      return 0;
    }
    log(`guidiff: ${e instanceof Error ? e.message : String(e)}`);
    log(USAGE);
    return 1;
  }

  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot(process.cwd());
  } catch {
    log('guidiff: not inside a git repository');
    return 1;
  }
  const gitDir = await getGitDir(process.cwd());

  let spec: DiffSpec;
  let files;
  try {
    spec = resolveDiffSpec(opts.positionals);
    files = await collectDiff(repoRoot, spec);
  } catch (e) {
    log(`guidiff: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (files.length === 0) {
    log('guidiff: no changes to review');
    return 1;
  }

  let guide: Guide | null = null;
  if (opts.guidePath) {
    const guideFile = Bun.file(opts.guidePath);
    if (!(await guideFile.exists())) {
      log(`guidiff: guide file not found: ${opts.guidePath}`);
      return 1;
    }
    let rawGuide: unknown;
    try {
      rawGuide = JSON.parse(await guideFile.text());
    } catch {
      log(`guidiff: invalid guide JSON: ${opts.guidePath} is not valid JSON`);
      return 1;
    }
    const parsed = GuideSchema.safeParse(rawGuide);
    if (!parsed.success) {
      log(`guidiff: invalid guide JSON:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
      return 1;
    }
    guide = parsed.data;
  }

  const state = await loadState(gitDir);
  const fileStates = reconcileFiles(state, files);

  const aiEnabled = opts.ai && Bun.which('claude') !== null;
  if (opts.ai && !aiEnabled) log('guidiff: Ask AI disabled (claude CLI not found on PATH)');
  let patchPath: string | null = null;
  if (aiEnabled) {
    // The model reads the diff from disk instead of receiving it inline, so
    // large diffs never blow up the prompt.
    patchPath = join(gitDir, 'guidiff', `chat-diff-${process.pid}.patch`);
    try {
      await mkdir(join(gitDir, 'guidiff'), { recursive: true });
      await Bun.write(patchPath, files.map((f) => f.patch).join('\n'));
    } catch (e) {
      log(`guidiff: could not write the diff for Ask AI: ${e instanceof Error ? e.message : String(e)}`);
      patchPath = null;
    }
  }

  const target = spec.kind === 'worktree' ? 'working tree' : spec.label;
  const repo = spec.kind === 'pr' ? spec.repo : await getRepoName(repoRoot);
  const { server, url, outcome, dispose } = startServer({
    port: opts.port,
    target,
    repo,
    guide,
    files,
    fileStates,
    gitDir,
    state,
    staticRoutes: { '/': indexHtml },
    ...(aiEnabled
      ? { ai: { provider: new ClaudeCliProvider(), cwd: repoRoot, patchPath, isPullRequest: spec.kind === 'pr' } }
      : {}),
  });

  log(`guidiff: listening on ${url}`);
  if (opts.open) {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    Bun.spawn([opener, url], { stdout: 'ignore', stderr: 'ignore' });
  }

  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const raced: Promise<{ type: 'cancel' } | Awaited<typeof outcome>> = opts.timeoutMin
    ? Promise.race([
        outcome,
        new Promise<{ type: 'cancel' }>((resolve) => {
          const timeoutMin = opts.timeoutMin!;
          timers.push(setTimeout(() => {
            log(`guidiff: timed out after ${timeoutMin} minutes`);
            resolve({ type: 'cancel' });
          }, timeoutMin * 60_000));
        }),
      ])
    : outcome;

  const final = await raced;
  for (const t of timers) clearTimeout(t);
  dispose();
  // Give the in-flight HTTP response a beat to flush before stopping.
  await Bun.sleep(50);
  server.stop(true);
  if (patchPath) await unlink(patchPath).catch(() => {});

  if (final.type === 'submit') {
    console.log(JSON.stringify(final.result, null, 2)); // the ONLY stdout write
    return 0;
  }
  log('guidiff: review cancelled');
  return 2;
}

process.exit(await main());
