/**
 * The guide column width shared by every `.section-row` and the no-guide
 * `.layout` sidebar. Stored as the CSS variable `--guide-w` on `:root`;
 * not persisted anywhere — a reload returns to the default.
 */
export const DEFAULT_GUIDE_WIDTH = 320;
export const MIN_GUIDE_WIDTH = 200;
export const MAX_GUIDE_WIDTH = 640;
export const KEYBOARD_STEP = 16;

export function clampGuideWidth(px: number, viewportWidth: number): number {
  const max = Math.max(MIN_GUIDE_WIDTH, Math.min(MAX_GUIDE_WIDTH, Math.floor(viewportWidth / 2)));
  return Math.min(max, Math.max(MIN_GUIDE_WIDTH, Math.round(px)));
}

export function getGuideWidth(): number {
  const raw = document.documentElement.style.getPropertyValue('--guide-w');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_GUIDE_WIDTH;
}

export function setGuideWidth(px: number): number {
  const width = clampGuideWidth(px, window.innerWidth);
  document.documentElement.style.setProperty('--guide-w', `${width}px`);
  return width;
}
