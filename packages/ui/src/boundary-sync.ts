/** Height of the sticky app header. Must match the 49px used in styles.css (.section-group min-height, sticky tops). */
export const HEADER_OFFSET = 49;

/**
 * Continuous section position for the boundary-synced two-pane scroll.
 *
 * Each boundary between consecutive groups contributes progress in [0, 1]:
 * 0 while group i's bottom edge is still at/below the viewport bottom, 1 once
 * it has fully left through the visible content band's top (viewportHeight
 * minus topOffset, to account for a sticky header covering the top of the
 * viewport). The sum is a continuous index `ci` in [0, n-1]: floor(ci) is the
 * locked/active section, and the fraction is how far the transition to the
 * next section has progressed.
 */
export function continuousSectionIndex(
  groupBottoms: number[],
  viewportHeight: number,
  topOffset = 0,
): number {
  if (viewportHeight - topOffset <= 0 || groupBottoms.length <= 1) return 0;
  let ci = 0;
  for (let i = 0; i < groupBottoms.length - 1; i++) {
    const p = (viewportHeight - groupBottoms[i]!) / (viewportHeight - topOffset);
    ci += Math.min(1, Math.max(0, p));
  }
  return ci;
}
