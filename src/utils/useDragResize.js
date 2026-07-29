import { useCallback, useRef } from 'react';

// Axis-parameterized drag-to-resize hook, generalizing the pattern
// duplicated inline in IDETerminal.jsx (y-axis/height only). Returns an
// onDragStart handler to wire to a drag-handle's onMouseDown; the caller
// owns the size state itself (mirrors IDETerminal's own local-state pattern
// — this is ephemeral UI layout preference, not model state).
//
// move/end are declared inside onDragStart itself (not at the hook's top
// level) so neither needs pre-registering in a ref or a circular useCallback
// dependency — they're plain nested closures, only ever touched from inside
// the mousedown/mousemove/mouseup event handlers themselves, never during render.
export function useDragResize({ axis = 'y', size, setSize, min = 80, max = 800 }) {
  const dragRef = useRef({ active: false, start: 0, startSize: 0 });

  const onDragStart = useCallback((e) => {
    dragRef.current = { active: true, start: axis === 'y' ? e.clientY : e.clientX, startSize: size };

    const onDragMove = (ev) => {
      if (!dragRef.current.active) return;
      const pos = axis === 'y' ? ev.clientY : ev.clientX;
      // y-axis (height, panel docked at the bottom): dragging up increases size.
      // x-axis (width, panel to the left of the handle): dragging right increases size.
      const delta = axis === 'y' ? (dragRef.current.start - pos) : (pos - dragRef.current.start);
      setSize(Math.max(min, Math.min(max, dragRef.current.startSize + delta)));
    };

    const onDragEnd = () => {
      dragRef.current.active = false;
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
    };

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }, [axis, size, min, max, setSize]);

  return { onDragStart };
}
