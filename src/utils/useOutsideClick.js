import { useEffect } from 'react';

// Closes a menu/popover when a mousedown lands outside `ref`'s element.
// Shared by every topbar's hamburger menu and Sidebar's conformance popover,
// which otherwise each redefined this exact listener.
export function useOutsideClick(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [active, ref, onOutside]);
}
