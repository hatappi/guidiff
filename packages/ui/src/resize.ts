/**
 * Resizable columns store their pinned width as a CSS custom property on
 * `:root`; an unset variable means "use the default", which for the guide
 * pane is a share of the viewport (the CSS fallback must match
 * DEFAULT_GUIDE_RATIO). Nothing is persisted — a reload returns to the
 * default.
 */
export interface ResizeSpec {
  variable: string;
  minPx: number;
  // The width may never exceed this share of the viewport.
  maxRatio: number;
  maxPx?: number;
  defaultPx?: number;
  defaultRatio?: number;
  // 'left': the column is anchored to the right edge, so dragging left widens.
  direction: 'right' | 'left';
}

export const DEFAULT_GUIDE_RATIO = 0.35;
export const MAX_GUIDE_RATIO = 0.5;
export const MIN_GUIDE_WIDTH = 200;
export const KEYBOARD_STEP = 16;

export const GUIDE_RESIZE: ResizeSpec = {
  variable: '--guide-w',
  minPx: MIN_GUIDE_WIDTH,
  maxRatio: MAX_GUIDE_RATIO,
  defaultRatio: DEFAULT_GUIDE_RATIO,
  direction: 'right',
};

export const CHAT_RESIZE: ResizeSpec = {
  variable: '--chat-w',
  minPx: 280,
  maxPx: 800,
  maxRatio: 0.5,
  defaultPx: 400,
  direction: 'left',
};

export function maxWidth(spec: ResizeSpec, viewportWidth: number): number {
  const cap = Math.floor(viewportWidth * spec.maxRatio);
  const max = spec.maxPx === undefined ? cap : Math.min(spec.maxPx, cap);
  return Math.max(spec.minPx, max);
}

export function defaultWidth(spec: ResizeSpec, viewportWidth: number): number {
  return spec.defaultPx ?? Math.round(viewportWidth * (spec.defaultRatio ?? 0));
}

export function clampWidth(spec: ResizeSpec, px: number, viewportWidth: number): number {
  return Math.min(maxWidth(spec, viewportWidth), Math.max(spec.minPx, Math.round(px)));
}

export function getWidth(spec: ResizeSpec): number {
  const raw = document.documentElement.style.getPropertyValue(spec.variable);
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : defaultWidth(spec, window.innerWidth);
}

export function setWidth(spec: ResizeSpec, px: number): number {
  const width = clampWidth(spec, px, window.innerWidth);
  document.documentElement.style.setProperty(spec.variable, `${width}px`);
  return width;
}

/** Back to the default; a ratio default tracks viewport resizes again. */
export function resetWidth(spec: ResizeSpec): number {
  document.documentElement.style.removeProperty(spec.variable);
  return getWidth(spec);
}

export const maxGuideWidth = (viewportWidth: number) => maxWidth(GUIDE_RESIZE, viewportWidth);
export const clampGuideWidth = (px: number, viewportWidth: number) => clampWidth(GUIDE_RESIZE, px, viewportWidth);
export const getGuideWidth = () => getWidth(GUIDE_RESIZE);
export const setGuideWidth = (px: number) => setWidth(GUIDE_RESIZE, px);
export const resetGuideWidth = () => resetWidth(GUIDE_RESIZE);
