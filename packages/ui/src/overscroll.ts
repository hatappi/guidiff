export type OverscrollEdge = 'top' | 'bottom' | null;

export interface OverscrollTracker {
  /**
   * Feed a wheel delta while positioned at (or off) an edge.
   * Accumulates deltas that point further past the edge; returns 'next'/'prev'
   * once the accumulation exceeds the threshold, resetting internally.
   * Any gap over 300ms, a reversed direction, or edge === null resets the
   * accumulation and returns null.
   */
  feed(edge: OverscrollEdge, delta: number, now: number): 'prev' | 'next' | null;
  reset(): void;
}

const IDLE_GAP_MS = 300;

/**
 * Classifies which scroll edge a wheel event should count toward.
 * When the content fits in one viewport both edges are true at once;
 * in that case the wheel's direction decides which edge applies.
 */
export function classifyEdge(
  scrollY: number,
  innerHeight: number,
  scrollHeight: number,
  deltaY: number,
): 'top' | 'bottom' | null {
  const atBottom = scrollY + innerHeight >= scrollHeight - 2;
  const atTop = scrollY <= 2;
  if (atBottom && atTop) return deltaY > 0 ? 'bottom' : deltaY < 0 ? 'top' : null;
  if (atBottom) return 'bottom';
  if (atTop) return 'top';
  return null;
}

/** Cumulative overscroll tracker used to trigger edge-scroll section paging. */
export function createOverscrollTracker(threshold: number): OverscrollTracker {
  let accumulated = 0;
  let lastEdge: OverscrollEdge = null;
  let lastTime: number | null = null;

  function reset() {
    accumulated = 0;
    lastEdge = null;
    lastTime = null;
  }

  function feed(edge: OverscrollEdge, delta: number, now: number): 'prev' | 'next' | null {
    if (edge === null) {
      reset();
      return null;
    }
    const towardEdge = edge === 'bottom' ? delta > 0 : delta < 0;
    if (!towardEdge) {
      reset();
      return null;
    }
    if (lastEdge !== edge || lastTime === null || now - lastTime > IDLE_GAP_MS) {
      accumulated = 0;
    }
    accumulated += Math.abs(delta);
    lastEdge = edge;
    lastTime = now;
    if (accumulated > threshold) {
      reset();
      return edge === 'bottom' ? 'next' : 'prev';
    }
    return null;
  }

  return { feed, reset };
}
