import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TARGETS, launcherSource, mainManifest, platformManifest } from './release-lib.ts';

const dryRun = process.argv.includes('--dry-run');
const log = (msg: string) => console.error(msg);
const repoRoot = join(import.meta.dir, '..');

function run(cmd: string[], cwd?: string): number {
  const proc = Bun.spawnSync(cmd, {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return proc.exitCode;
}

if (!dryRun) {
  const status = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: repoRoot });
  if (status.stdout.toString().trim() !== '') {
    log('release: working tree is not clean — commit changes first');
    process.exit(1);
  }
}

const rootPkg = (await Bun.file(join(repoRoot, 'package.json')).json()) as { version: string };
const version = rootPkg.version;
log(`release: guidiff v${version}${dryRun ? ' (dry run)' : ''}`);

const distDir = join(repoRoot, 'dist', 'npm');
rmSync(distDir, { recursive: true, force: true });

const pkgs: { name: string; dir: string }[] = [];

for (const t of TARGETS) {
  const dir = join(distDir, `cli-${t.os}-${t.cpu}`);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  log(`release: building ${t.npmName} (${t.bunTarget})`);
  const code = run([
    'bun',
    'build',
    '--compile',
    '--minify',
    join(repoRoot, 'packages', 'cli', 'src', 'index.ts'),
    `--target=${t.bunTarget}`,
    '--outfile',
    join(dir, 'bin', 'guidiff'),
  ]);
  if (code !== 0) {
    log(`release: build failed for ${t.bunTarget}`);
    process.exit(1);
  }
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(platformManifest(t, version), null, 2)}\n`);
  pkgs.push({ name: t.npmName, dir });
}

const mainDir = join(distDir, 'guidiff');
mkdirSync(join(mainDir, 'bin'), { recursive: true });
writeFileSync(join(mainDir, 'package.json'), `${JSON.stringify(mainManifest(version), null, 2)}\n`);
writeFileSync(join(mainDir, 'bin', 'guidiff.js'), launcherSource(), { mode: 0o755 });
cpSync(join(repoRoot, 'README.md'), join(mainDir, 'README.md'));
pkgs.push({ name: 'guidiff', dir: mainDir });

for (const { name, dir } of pkgs) {
  if (dryRun) {
    log(`release: npm pack --dry-run for ${name}`);
    if (run(['npm', 'pack', '--dry-run'], dir) !== 0) {
      log(`release: npm pack failed for ${name}`);
      process.exit(1);
    }
    continue;
  }
  const view = Bun.spawnSync(['npm', 'view', `${name}@${version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (view.exitCode === 0 && view.stdout.toString().trim() === version) {
    log(`release: ${name}@${version} already published — skipping`);
    continue;
  }
  log(`release: publishing ${name}@${version}`);
  if (run(['npm', 'publish', '--access', 'public'], dir) !== 0) {
    log(`release: publish failed for ${name}`);
    process.exit(1);
  }
}

log(dryRun ? 'release: dry run complete' : 'release: all packages published');
