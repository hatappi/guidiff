import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  GUIDE_RESIZE,
  KEYBOARD_STEP,
  getWidth,
  maxWidth,
  resetWidth,
  setWidth,
  type ResizeSpec,
} from '../resize.ts';

/**
 * Draggable divider on a resizable column's edge. Writes the column's CSS
 * variable directly (no React state) so dragging never re-renders the diff,
 * and every handle for the same column stays in sync for free.
 */
export default function ResizeHandle(props: { spec?: ResizeSpec; ariaLabel?: string }) {
  const spec = props.spec ?? GUIDE_RESIZE;
  // A right-anchored column grows when its left edge moves left.
  const sign = spec.direction === 'left' ? -1 : 1;
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  // Unmount during a drag (e.g. submit) must not leave the page in the
  // selection-disabled resizing state.
  useEffect(() => () => {
    if (drag.current) document.documentElement.removeAttribute('data-resizing');
  }, []);

  const announce = (width: number) => ref.current?.setAttribute('aria-valuenow', String(width));
  const apply = (px: number) => announce(setWidth(spec, px));

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    document.documentElement.removeAttribute('data-resizing');
  };

  return (
    <div
      ref={ref}
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={props.ariaLabel ?? 'Resize guide panel'}
      aria-valuemin={spec.minPx}
      aria-valuemax={maxWidth(spec, window.innerWidth)}
      aria-valuenow={getWidth(spec)}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { pointerId: e.pointerId, startX: e.clientX, startWidth: getWidth(spec) };
        // Not implemented in happy-dom; real browsers need it so the drag
        // keeps tracking when the pointer leaves the 6px strip.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        document.documentElement.setAttribute('data-resizing', '');
      }}
      onPointerMove={(e) => {
        if (drag.current?.pointerId !== e.pointerId) return;
        apply(drag.current.startWidth + sign * (e.clientX - drag.current.startX));
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => announce(resetWidth(spec))}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        apply(getWidth(spec) + sign * (e.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP));
      }}
    />
  );
}
