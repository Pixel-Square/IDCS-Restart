import { useEffect } from 'react';

export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    if (typeof document === 'undefined') return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [locked]);
}
