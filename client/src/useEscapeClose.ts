import { useEffect } from 'react';

/**
 * Close a modal/overlay when the user presses Escape — a baseline
 * accessibility expectation for dialogs. Shared by the game's overlay panels.
 */
export function useEscapeClose(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}
