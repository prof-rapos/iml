import { useEffect } from 'react';

// Delete/Backspace triggers onDelete() for the current selection — guards
// against firing while a text input has focus. Shared by every canvas
// (Structural, State Machine, Capsule Structure), which otherwise each
// redefined this exact listener.
export function useDeleteKeyHandler(selectedId, onDelete) {
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selectedId) return;
      onDelete();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, onDelete]);
}
