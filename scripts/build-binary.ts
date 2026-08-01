import { join } from 'node:path';

const log = (msg: string) => console.error(msg);
const repoRoot = join(import.meta.dir, '..');

const pkg = (await Bun.file(join(repoRoot, 'package.json')).json()) as { version: string };
const hashProc = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: repoRoot });
const hash = hashProc.exitCode === 0 ? hashProc.stdout.toString().trim() : 'unknown';
const version = `${pkg.version}-dev+${hash}`;

log(`build-binary: guidiff v${version}`);
const proc = Bun.spawnSync(
  [
    'bun',
    'build',
    '--compile',
    '--minify',
    join(repoRoot, 'packages', 'cli', 'src', 'index.ts'),
    '--define',
    `GUIDIFF_VERSION=${JSON.stringify(version)}`,
    '--outfile',
    join(repoRoot, 'guidiff'),
  ],
  { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
);
process.exit(proc.exitCode);
