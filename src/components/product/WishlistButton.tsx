import { useEffect, useRef, type MouseEvent } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Heart } from "lucide-react";
import { useIsWishlisted, useWishlistStore } from "@/lib/store/wishlist-store";
import { cn } from "@/lib/utils";

/* ============================================================
   WISHLIST BUTTON — coração de favoritos (toggle)
   Círculo glass; ativo = gradiente + fill + pop spring.
   Funciona sem login e com produto esgotado (não bloqueia).
   ============================================================ */

export function WishlistButton({
  slug,
  size = "sm",
  className = "",
}: {
  slug: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const active = useIsWishlisted(slug);
  const toggle = useWishlistStore((s) => s.toggle);
  const controls = useAnimationControls();
  const first = useRef(true);

  /* Pop de escala ao alternar (pula o primeiro render para não "piscar") */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    controls.start({
      scale: [1, 1.35, 1],
      transition: { type: "spring", stiffness: 460, damping: 16 },
    });
  }, [active, controls]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(slug);
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={active}
      title={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      animate={controls}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.85 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={cn(
        "grid shrink-0 cursor-pointer place-items-center backdrop-blur-md transition-colors duration-300",
        size === "sm" ? "size-10 rounded-full" : "size-14 rounded-2xl",
        active
          ? "bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow hover:shadow-glow-lg"
          : "glass text-muted hover:text-primary hover:shadow-glow",
        className,
      )}
    >
      <Heart className={cn(size === "lg" ? "size-6" : "size-5", active && "fill-current")} />
    </motion.button>
  );
}
