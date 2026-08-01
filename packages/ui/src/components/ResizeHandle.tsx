import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_GUIDE_WIDTH,
  KEYBOARD_STEP,
  MAX_GUIDE_WIDTH,
  MIN_GUIDE_WIDTH,
  getGuideWidth,
  setGuideWidth,
} from '../resize.ts';

/**
 * Draggable divider on the guide/diff column boundary. Writes the shared
 * `--guide-w` CSS variable directly (no React state) so dragging never
 * re-renders the diff, and every row's handle stays in sync for free.
 */
export default function ResizeHandle() {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  // Unmount during a drag (e.g. submit) must not leave the page in the
  // selection-disabled resizing state.
  useEffect(() => () => {
    if (drag.current) document.documentElement.removeAttribute('data-resizing');
  }, []);

  const apply = (px: number) => {
    const width = setGuideWidth(px);
    ref.current?.setAttribute('aria-valuenow', String(width));
  };

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
      aria-label="Resize guide panel"
      aria-valuemin={MIN_GUIDE_WIDTH}
      aria-valuemax={MAX_GUIDE_WIDTH}
      aria-valuenow={getGuideWidth()}
      tabIndex={0}
      onPointerDown={(e) => {
        drag.current = { pointerId: e.pointerId, startX: e.clientX, startWidth: getGuideWidth() };
        // Not implemented in happy-dom; real browsers need it so the drag
        // keeps tracking when the pointer leaves the 6px strip.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        document.documentElement.setAttribute('data-resizing', '');
      }}
      onPointerMove={(e) => {
        if (drag.current?.pointerId !== e.pointerId) return;
        apply(drag.current.startWidth + (e.clientX - drag.current.startX));
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => apply(DEFAULT_GUIDE_WIDTH)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        apply(getGuideWidth() + (e.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP));
      }}
    />
  );
}
