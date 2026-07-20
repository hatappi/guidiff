/** First id in document order currently intersecting the viewport. */
export function topmostGroupId(intersecting: Set<string>, order: string[]): string | null {
  return order.find((id) => intersecting.has(id)) ?? null;
}

/** Card whose top edge is closest to the container's scrollTop. */
export function nearestCardId(
  scrollTop: number,
  cards: Array<{ id: string; offsetTop: number }>,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of cards) {
    const dist = Math.abs(c.offsetTop - scrollTop);
    if (dist < bestDist) {
      bestDist = dist;
      best = c.id;
    }
  }
  return best;
}
