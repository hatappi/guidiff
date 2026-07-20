/**
 * Continuous section position for the boundary-synced two-pane scroll.
 *
 * Each boundary between consecutive groups contributes progress in [0, 1]:
 * 0 while group i's bottom edge is still at/below the viewport bottom, 1 once
 * it has fully left through the viewport top. The sum is a continuous index
 * `ci` in [0, n-1]: floor(ci) is the locked/active section, and the fraction
 * is how far the transition to the next section has progressed.
 */
export function continuousSectionIndex(groupBottoms: number[], viewportHeight: number): number {
  if (viewportHeight <= 0 || groupBottoms.length <= 1) return 0;
  let ci = 0;
  for (let i = 0; i < groupBottoms.length - 1; i++) {
    const p = (viewportHeight - groupBottoms[i]!) / viewportHeight;
    ci += Math.min(1, Math.max(0, p));
  }
  return ci;
}
