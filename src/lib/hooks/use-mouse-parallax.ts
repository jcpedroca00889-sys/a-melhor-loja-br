import { useEffect } from "react";
import { useMotionValue, useSpring, type MotionValue } from "framer-motion";

/* ============================================================
   PARALLAX — elementos acompanham o mouse suavemente (springs)
   Uso: const { x, y } = useMouseParallax(20); style={{ x, y }}
   ============================================================ */

export function useMouseParallax(strength = 20): {
  x: MotionValue<number>;
  y: MotionValue<number>;
} {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 60, damping: 18, mass: 0.6 });
  const y = useSpring(rawY, { stiffness: 60, damping: 18, mass: 0.6 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      rawX.set((e.clientX / window.innerWidth - 0.5) * strength);
      rawY.set((e.clientY / window.innerHeight - 0.5) * strength);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [rawX, rawY, strength]);

  return { x, y };
}
