import { useEffect, useRef, useState } from "react";

/* ============================================================
   COUNT UP — número anima de 0 (ou valor anterior) até target
   ============================================================ */

export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const diff = target - from;
    if (diff === 0) return;

    let start: number | null = null;

    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / duration, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const next = from + diff * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
