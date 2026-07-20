#!/usr/bin/env bun
import { GuideSchema, type Guide } from '@guidiff/schema';
import indexHtml from '@guidiff/ui/index.html';
import { HelpRequested, parseCliArgs, USAGE } from './cli-args.ts';
import { collectDiff, getGitDir, getRepoRoot, resolveDiffSpec } from './git.ts';
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

  const spec = resolveDiffSpec(opts.positionals);
  const files = await collectDiff(repoRoot, spec);
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

  const target = spec.kind === 'worktree' ? 'working tree' : spec.label;
  const { server, url, outcome } = startServer({
    port: opts.port,
    target,
    guide,
    files,
    fileStates,
    gitDir,
    state,
    staticRoutes: { '/': indexHtml },
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
  // Give the in-flight HTTP response a beat to flush before stopping.
  await Bun.sleep(50);
  server.stop(true);

  if (final.type === 'submit') {
    console.log(JSON.stringify(final.result, null, 2)); // the ONLY stdout write
    return 0;
  }
  log('guidiff: review cancelled');
  return 2;
}

process.exit(await main());
