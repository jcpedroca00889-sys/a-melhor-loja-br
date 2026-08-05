import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ============================================================
   REVEAL — elementos surgem suavemente ao rolar (GSAP)
   Uso: const ref = useReveal(); <section ref={ref}>
   Com stagger: anima os filhos diretos em cascata.
   ============================================================ */

interface RevealOptions {
  y?: number;
  duration?: number;
  delay?: number;
  stagger?: number;
}

export function useReveal<T extends HTMLElement>(
  opts: RevealOptions = {},
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const { y = 28, duration = 0.9, delay = 0, stagger = 0 } = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const targets: gsap.TweenTarget =
        stagger > 0 ? el.querySelectorAll(":scope > *") : el;
      gsap.set(targets, { opacity: 0, y });
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () => {
          gsap.to(targets, {
            opacity: 1,
            y: 0,
            duration,
            delay,
            ease: "power3.out",
            stagger,
          });
        },
      });
    }, el);

    return () => ctx.revert();
  }, [y, duration, delay, stagger]);

  return ref;
}
