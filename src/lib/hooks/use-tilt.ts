import { useEffect, useRef, type RefObject } from "react";
import { useMotionValue, useSpring, type MotionValue } from "framer-motion";

/* ============================================================
   TILT — inclinação 3D que segue o cursor (cards)
   Uso: const { ref, rotateX, rotateY, transformPerspective } = useTilt(8);
        <motion.div ref={ref} style={{ rotateX, rotateY, transformPerspective }}>
   ============================================================ */

export function useTilt<T extends HTMLElement = HTMLDivElement>(maxDeg = 6): {
  ref: RefObject<T | null>;
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  transformPerspective: MotionValue<number>;
} {
  const ref = useRef<T>(null);
  const rotateX = useSpring(0, { stiffness: 220, damping: 20 });
  const rotateY = useSpring(0, { stiffness: 220, damping: 20 });
  const transformPerspective = useMotionValue(900);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      rotateY.set((px - 0.5) * 2 * maxDeg);
      rotateX.set(-(py - 0.5) * 2 * maxDeg);
    };
    const onLeave = () => {
      rotateX.set(0);
      rotateY.set(0);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [maxDeg, rotateX, rotateY]);

  return { ref, rotateX, rotateY, transformPerspective };
}
