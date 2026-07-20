import { beforeEach, describe, expect, test } from 'bun:test';
// The shared preload stubs ./src/highlight.ts only; theme.ts is unmocked.
import { loadStoredTheme, resolveTheme, saveStoredTheme } from './theme.ts';

describe('resolveTheme', () => {
  test('stored value wins over OS preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  test('falls back to OS preference when nothing stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });
});

describe('stored theme round-trip', () => {
  beforeEach(() => localStorage.removeItem('guidiff-theme'));
  test('save then load', () => {
    expect(loadStoredTheme()).toBeNull();
    saveStoredTheme('dark');
    expect(loadStoredTheme()).toBe('dark');
  });
  test('garbage in storage reads as null', () => {
    localStorage.setItem('guidiff-theme', 'blue');
    expect(loadStoredTheme()).toBeNull();
  });
});
