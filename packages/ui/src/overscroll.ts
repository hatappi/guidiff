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
