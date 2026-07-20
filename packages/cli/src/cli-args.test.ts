import { describe, expect, test } from 'bun:test';
import { parseCliArgs } from './cli-args.ts';

describe('parseCliArgs', () => {
  test('defaults', () => {
    expect(parseCliArgs([])).toEqual({ positionals: [], port: 0, open: true });
  });

  test('full options', () => {
    expect(parseCliArgs(['main', 'feature', '--guide', 'g.json', '--port', '3999', '--timeout', '30', '--no-open']))
      .toEqual({
        positionals: ['main', 'feature'],
        guidePath: 'g.json',
        port: 3999,
        timeoutMin: 30,
        open: false,
      });
  });

  test('rejects unknown flags', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow();
  });
});
