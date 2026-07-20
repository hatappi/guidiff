import { describe, expect, test } from 'bun:test';
import { createOverscrollTracker } from './overscroll.ts';

describe('createOverscrollTracker', () => {
  test('fires "next" once accumulated bottom-edge deltas exceed the threshold', () => {
    const tracker = createOverscrollTracker(120);
    expect(tracker.feed('bottom', 50, 0)).toBeNull();
    expect(tracker.feed('bottom', 50, 10)).toBeNull();
    expect(tracker.feed('bottom', 50, 20)).toBe('next');
  });

  test('fires "prev" once accumulated top-edge deltas exceed the threshold', () => {
    const tracker = createOverscrollTracker(120);
    expect(tracker.feed('top', -50, 0)).toBeNull();
    expect(tracker.feed('top', -50, 10)).toBeNull();
    expect(tracker.feed('top', -50, 20)).toBe('prev');
  });

  test('resets accumulation when a gap of more than 300ms passes between wheel events', () => {
    const tracker = createOverscrollTracker(120);
    expect(tracker.feed('bottom', 100, 0)).toBeNull();
    // Big gap: the previous 100 should be forgotten, so 100 alone at t=500 is not enough.
    expect(tracker.feed('bottom', 100, 500)).toBeNull();
    expect(tracker.feed('bottom', 100, 510)).toBe('next');
  });

  test('resets accumulation when the wheel direction reverses away from the edge', () => {
    const tracker = createOverscrollTracker(120);
    expect(tracker.feed('bottom', 100, 0)).toBeNull();
    // Scrolling back up while pinned to the bottom edge should discard the buildup.
    expect(tracker.feed('bottom', -30, 10)).toBeNull();
    expect(tracker.feed('bottom', 100, 20)).toBeNull();
    expect(tracker.feed('bottom', 100, 30)).toBe('next');
  });

  test('never fires when not positioned at an edge', () => {
    const tracker = createOverscrollTracker(120);
    expect(tracker.feed(null, 1000, 0)).toBeNull();
    expect(tracker.feed(null, 1000, 10)).toBeNull();
    expect(tracker.feed(null, 1000, 20)).toBeNull();
  });

  test('resets internal state after firing so a fresh sequence is required to fire again', () => {
    const tracker = createOverscrollTracker(120);
    expect(tracker.feed('bottom', 130, 0)).toBe('next');
    expect(tracker.feed('bottom', 10, 10)).toBeNull();
    expect(tracker.feed('bottom', 10, 20)).toBeNull();
  });

  test('reset() clears accumulation on demand', () => {
    const tracker = createOverscrollTracker(120);
    expect(tracker.feed('bottom', 100, 0)).toBeNull();
    tracker.reset();
    expect(tracker.feed('bottom', 100, 10)).toBeNull();
  });
});
