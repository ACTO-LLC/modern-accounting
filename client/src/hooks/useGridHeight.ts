import { useState, useEffect, useCallback, type RefObject } from 'react';

/**
 * Measures remaining viewport height from an element's top position.
 * Returns a pixel value that fills from the element to the bottom of the viewport.
 */
export default function useGridHeight(ref: RefObject<HTMLElement | null>, bottomPadding = 16): number {
  const [height, setHeight] = useState(600);

  const measure = useCallback(() => {
    if (ref.current) {
      const top = ref.current.getBoundingClientRect().top;
      setHeight(Math.max(400, window.innerHeight - top - bottomPadding));
    }
  }, [ref, bottomPadding]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return height;
}
