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
