import { useEffect, useState } from 'react';

function getInitialValue() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(getInitialValue);

  useEffect(() => {
    if (!window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(event.matches);

    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}
