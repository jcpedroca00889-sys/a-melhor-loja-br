import { useEffect, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ProductBadge } from "./ProductBadge";
import type { Badge } from "@/lib/types";

/* ============================================================
   PRODUCT GALLERY — imagem grande com zoom seguindo o cursor,
   troca automática de imagens (pausa no hover) + thumbnails
   ============================================================ */

const SWITCH_INTERVAL = 3200;

export function ProductGallery({
  images,
  name,
  badges,
}: {
  images: string[];
  name: string;
  badges: Badge[];
}) {
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (images.length < 2) return;
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % images.length);
    }, SWITCH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [images.length]);

  const pauseAutoSwitch = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };
  const resumeAutoSwitch = () => {
    if (images.length < 2) return;
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % images.length);
    }, SWITCH_INTERVAL);
  };

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    setZoomed(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-hero bg-surface shadow-soft"
        onMouseMove={onMove}
        onMouseEnter={pauseAutoSwitch}
        onMouseLeave={() => {
          setZoomed(false);
          resumeAutoSwitch();
        }}
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={active}
            src={images[active]}
            alt={name}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              scale: zoomed ? 1.85 : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            style={{ transformOrigin: `${origin.x}% ${origin.y}%` }}
            className="size-full object-cover"
          />
        </AnimatePresence>

        {/* Badges */}
        <div className="absolute left-5 top-5 z-10 flex flex-col items-start gap-2">
          {badges.map((b) => (
            <ProductBadge key={b} badge={b} />
          ))}
        </div>

        {/* Contador */}
        <span className="glass absolute bottom-4 right-4 z-10 rounded-full px-3 py-1 text-xs font-semibold text-muted">
          {active + 1} / {images.length}
        </span>

        {/* Dica de zoom */}
        <span className="glass absolute bottom-4 left-4 z-10 rounded-full px-3 py-1 text-[11px] font-medium text-dim opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          🔍 passe o mouse para dar zoom
        </span>
      </div>

      {/* Thumbnails */}
      <div className="grid grid-cols-4 gap-3">
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setActive(i);
              setZoomed(false);
            }}
            className={cn(
              "relative aspect-square cursor-pointer overflow-hidden rounded-2xl border-2 transition-all duration-300",
              i === active
                ? "border-primary shadow-glow scale-[1.03]"
                : "border-transparent opacity-60 hover:opacity-100 hover:scale-[1.02]",
            )}
          >
            <img src={img} alt={`${name} — visual ${i + 1}`} className="size-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
