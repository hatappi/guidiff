export interface Target {
  bunTarget: string;
  npmName: string;
  os: string;
  cpu: string;
}

const REPO_URL = 'https://github.com/hatappi/guidiff';

function target(os: string, cpu: string): Target {
  return {
    bunTarget: `bun-${os}-${cpu}`,
    npmName: `@guidiff/cli-${os}-${cpu}`,
    os,
    cpu,
  };
}

export const TARGETS: Target[] = [
  target('darwin', 'arm64'),
  target('darwin', 'x64'),
  target('linux', 'x64'),
  target('linux', 'arm64'),
];

export function platformManifest(t: Target, version: string): Record<string, unknown> {
  return {
    name: t.npmName,
    version,
    description: `guidiff binary for ${t.os}-${t.cpu}`,
    repository: { type: 'git', url: `git+${REPO_URL}.git` },
    license: 'MIT',
    os: [t.os],
    cpu: [t.cpu],
  };
}

export function mainManifest(version: string): Record<string, unknown> {
  const optionalDependencies: Record<string, string> = {};
  for (const t of TARGETS) {
    optionalDependencies[t.npmName] = version;
  }
  return {
    name: 'guidiff',
    version,
    description:
      'Guided local code review — a GitHub-like diff UI with an AI reading guide',
    keywords: ['code-review', 'diff', 'git', 'cli', 'ai'],
    repository: { type: 'git', url: `git+${REPO_URL}.git` },
    homepage: `${REPO_URL}#readme`,
    license: 'MIT',
    bin: { guidiff: 'bin/guidiff.js' },
    engines: { node: '>=18' },
    optionalDependencies,
  };
}

export function launcherSource(): string {
  const map: Record<string, string> = {};
  for (const t of TARGETS) {
    map[`${t.os}-${t.cpu}`] = t.npmName;
  }
  return `#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');

const PACKAGES = ${JSON.stringify(map, null, 2)};

const key = process.platform + '-' + process.arch;
const pkg = PACKAGES[key];
if (!pkg) {
  console.error('guidiff: unsupported platform: ' + key);
  console.error('Supported platforms: ' + Object.keys(PACKAGES).join(', '));
  process.exit(1);
}

let bin;
try {
  bin = require.resolve(pkg + '/bin/guidiff');
} catch {
  console.error('guidiff: binary package ' + pkg + ' is not installed.');
  console.error('Reinstall guidiff without disabling optional dependencies.');
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  console.error('guidiff: failed to run binary: ' + result.error.message);
  process.exit(1);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status === null ? 1 : result.status);
`;
}
