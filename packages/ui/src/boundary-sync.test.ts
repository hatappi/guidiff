import { describe, expect, test } from 'bun:test';
import { continuousSectionIndex } from './boundary-sync.ts';

describe('continuousSectionIndex', () => {
  const H = 1000;

  test('single group or empty yields 0', () => {
    expect(continuousSectionIndex([], H)).toBe(0);
    expect(continuousSectionIndex([500], H)).toBe(0);
  });

  test('boundary progresses 0 -> 0.5 -> 1 as the first group bottom rises', () => {
    // bottom at viewport bottom: not started
    expect(continuousSectionIndex([1000, 3000], H)).toBe(0);
    // bottom halfway up
    expect(continuousSectionIndex([500, 3000], H)).toBe(0.5);
    // bottom above viewport top: fully crossed
    expect(continuousSectionIndex([0, 3000], H)).toBe(1);
    expect(continuousSectionIndex([-400, 3000], H)).toBe(1);
  });

  test('below-viewport bottoms clamp to 0', () => {
    expect(continuousSectionIndex([2500, 4000], H)).toBe(0);
  });

  test('multiple short sections sum their progress', () => {
    // group0 fully crossed (1), group1 60% crossed (0.6), group2 is last (no boundary)
    expect(continuousSectionIndex([-100, 400, 900], H)).toBeCloseTo(1.6, 5);
  });

  test('zero viewport height yields 0', () => {
    expect(continuousSectionIndex([100, 200], 0)).toBe(0);
  });
});
