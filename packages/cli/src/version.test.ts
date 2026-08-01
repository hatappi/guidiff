import { describe, expect, test } from 'bun:test';
import { VERSION } from './version.ts';
import pkg from '../../../package.json';

describe('VERSION', () => {
  test('falls back to <package.json version>-dev when no build define is set', () => {
    expect(VERSION).toBe(`${pkg.version}-dev`);
  });
});
