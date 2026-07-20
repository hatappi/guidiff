import { describe, expect, test } from 'bun:test';
import { nearestCardId } from './scroll-sync.ts';

describe('nearestCardId', () => {
  const cards = [
    { id: 'a', offsetTop: 0 },
    { id: 'b', offsetTop: 600 },
    { id: 'c', offsetTop: 1200 },
  ];
  test('picks the card whose top is closest to scrollTop', () => {
    expect(nearestCardId(0, cards)).toBe('a');
    expect(nearestCardId(580, cards)).toBe('b');
    expect(nearestCardId(910, cards)).toBe('c');
    expect(nearestCardId(1500, cards)).toBe('c');
  });
  test('returns null for empty cards', () => {
    expect(nearestCardId(0, [])).toBeNull();
  });
});
