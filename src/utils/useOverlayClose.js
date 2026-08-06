import { useRef } from 'react';

// Safe "click outside to close" handlers for a full-screen modal overlay.
// A plain onClick={onClose} on the overlay div closes the modal on ANY
// text-selection drag that starts inside the modal (e.g. highlighting an
// existing name to retype it) and ends outside it: per the DOM click spec,
// the "click" event fires on the nearest common ancestor of the mousedown
// and mouseup targets, which becomes the overlay itself the moment the
// drag crosses its boundary — even though the user never intended to
// close anything, just select text.
//
// Tracking mousedown/mouseup directly, and requiring BOTH to land exactly
// on the overlay element itself (not a bubbled descendant), avoids this:
// a selection drag that starts on an input and ends on the overlay no
// longer counts, since mousedown didn't originate on the overlay.
export function useOverlayClose(onClose) {
  const downOnOverlay = useRef(false);
  return {
    onMouseDown: (e) => { downOnOverlay.current = e.target === e.currentTarget; },
    onMouseUp: (e) => {
      if (downOnOverlay.current && e.target === e.currentTarget) onClose();
      downOnOverlay.current = false;
    },
  };
}
