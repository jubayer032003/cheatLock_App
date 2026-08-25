import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(target: number, durationMs = 350) {
  const normalizedTarget = Number.isFinite(target) ? target : 0;
  const [displayValue, setDisplayValue] = useState(normalizedTarget);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplayValue(normalizedTarget);
      return;
    }

    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
    }

    const startValue = displayValue;
    const startedAt = performance.now();
    const distance = normalizedTarget - startValue;

    if (distance === 0) return;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + distance * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [durationMs, normalizedTarget]);

  return displayValue;
}
