/**
 * The guide column width shared by every `.section-row` and the no-guide
 * `.layout` sidebar. Defaults to a share of the viewport (the CSS fallback
 * of `--guide-w`, which must match DEFAULT_GUIDE_RATIO); a manual resize
 * pins it to a pixel value in `--guide-w` on `:root`. Not persisted
 * anywhere — a reload returns to the default.
 */
export const DEFAULT_GUIDE_RATIO = 0.35;
export const MAX_GUIDE_RATIO = 0.5;
export const MIN_GUIDE_WIDTH = 200;
export const KEYBOARD_STEP = 16;

export function maxGuideWidth(viewportWidth: number): number {
  return Math.max(MIN_GUIDE_WIDTH, Math.floor(viewportWidth * MAX_GUIDE_RATIO));
}

export function clampGuideWidth(px: number, viewportWidth: number): number {
  return Math.min(maxGuideWidth(viewportWidth), Math.max(MIN_GUIDE_WIDTH, Math.round(px)));
}

export function getGuideWidth(): number {
  const raw = document.documentElement.style.getPropertyValue('--guide-w');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : Math.round(window.innerWidth * DEFAULT_GUIDE_RATIO);
}

export function setGuideWidth(px: number): number {
  const width = clampGuideWidth(px, window.innerWidth);
  document.documentElement.style.setProperty('--guide-w', `${width}px`);
  return width;
}

/** Back to the ratio-based default, which tracks viewport resizes again. */
export function resetGuideWidth(): number {
  document.documentElement.style.removeProperty('--guide-w');
  return getGuideWidth();
}
