/**
 * Widgets inside the edit-mode drag grid can register a drag-release as a
 * native `click` on whatever element the pointer happens to be over. This
 * hook exposes a pointerdown/click pair that only fires the click handler
 * when the pointer didn't move (beyond a small tolerance) between the two.
 */
import { useRef } from 'react';

const CLICK_DRAG_THRESHOLD_PX = 5;

export function useClickDragGuard() {
  const pointerDownPos = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: { clientX: number; clientY: number }) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const guardClick = (e: { clientX: number; clientY: number }, onClick: () => void) => {
    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) return;
    onClick();
  };

  return { onPointerDown, guardClick };
}
