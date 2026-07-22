import { expect, test } from 'bun:test';
import { TARGETS, mainManifest, platformManifest } from './release-lib.ts';

test('TARGETS covers exactly the four supported platforms', () => {
  expect(TARGETS.map((t) => `${t.os}-${t.cpu}`).sort()).toEqual([
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
  ]);
  for (const t of TARGETS) {
    expect(t.bunTarget).toBe(`bun-${t.os}-${t.cpu}`);
    expect(t.npmName).toBe(`@guidiff/cli-${t.os}-${t.cpu}`);
  }
});

test('platformManifest pins name/version and restricts os/cpu', () => {
  const t = TARGETS[0]!;
  const m = platformManifest(t, '1.2.3') as Record<string, unknown>;
  expect(m.name).toBe(t.npmName);
  expect(m.version).toBe('1.2.3');
  expect(m.os).toEqual([t.os]);
  expect(m.cpu).toEqual([t.cpu]);
  expect(m.license).toBe('MIT');
});

test('mainManifest pins every platform package to the exact version', () => {
  const m = mainManifest('1.2.3') as {
    name: string;
    version: string;
    bin: Record<string, string>;
    optionalDependencies: Record<string, string>;
  };
  expect(m.name).toBe('guidiff');
  expect(m.version).toBe('1.2.3');
  expect(m.bin).toEqual({ guidiff: 'bin/guidiff.js' });
  expect(Object.keys(m.optionalDependencies).sort()).toEqual(
    TARGETS.map((t) => t.npmName).sort(),
  );
  for (const v of Object.values(m.optionalDependencies)) {
    expect(v).toBe('1.2.3');
  }
});
