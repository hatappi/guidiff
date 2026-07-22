import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { TARGETS, launcherSource, mainManifest, platformManifest } from './release-lib.ts';

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

test('launcherSource maps every target and runs under node', () => {
  const src = launcherSource();
  expect(src.startsWith('#!/usr/bin/env node\n')).toBe(true);
  for (const t of TARGETS) {
    expect(src).toContain(`"${t.os}-${t.cpu}": "${t.npmName}"`);
  }
});

const current = TARGETS.find(
  (t) => t.os === process.platform && t.cpu === process.arch,
);

test.if(current !== undefined)(
  'launcher spawns the platform binary, forwards args, propagates exit code',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'guidiff-launcher-'));
    const pkgDir = join(root, 'node_modules', current!.npmName);
    mkdirSync(join(pkgDir, 'bin'), { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: current!.npmName, version: '0.0.0' }));
    writeFileSync(join(pkgDir, 'bin', 'guidiff'), '#!/bin/sh\nprintf "args:%s\\n" "$*"\nexit 42\n', { mode: 0o755 });

    const launcherDir = join(root, 'node_modules', 'guidiff', 'bin');
    mkdirSync(launcherDir, { recursive: true });
    const launcherPath = join(launcherDir, 'guidiff.js');
    writeFileSync(launcherPath, launcherSource(), { mode: 0o755 });

    const proc = Bun.spawnSync(['node', launcherPath, '--help', 'x']);
    expect(proc.stdout.toString()).toContain('args:--help x');
    expect(proc.exitCode).toBe(42);
  },
);
