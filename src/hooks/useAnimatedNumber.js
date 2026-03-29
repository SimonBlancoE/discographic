import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

export function useAnimatedNumber(value, options = {}) {
  const { duration = 1200, decimals = 0 } = options;
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(Number(value) || 0);

  useEffect(() => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      setDisplayValue(0);
      return undefined;
    }

    if (reducedMotion) {
      setDisplayValue(numericValue);
      return undefined;
    }

    let frameId = 0;
    let startTime = 0;
    const startValue = displayValue;
    const delta = numericValue - startValue;

    const tick = (timestamp) => {
      if (!startTime) {
        startTime = timestamp;
      }

      const progress = Math.min(1, (timestamp - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (delta * eased);
      setDisplayValue(progress === 1 ? numericValue : nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [value, duration, reducedMotion]);

  return Number(displayValue.toFixed(decimals));
}
