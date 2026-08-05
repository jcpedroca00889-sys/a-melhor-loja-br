import { memo, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import type { Product } from "@/lib/types";
import { useTilt } from "@/lib/hooks/use-tilt";
import { useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";
import { PriceTag } from "./PriceTag";
import { ProductBadge } from "./ProductBadge";
import { RatingStars } from "./RatingStars";
import { WishlistButton } from "./WishlistButton";

/* ============================================================
   PRODUCT CARD — tilt 3D + levitação + rotate + borda glow
   + luz seguindo o cursor + brilho na imagem
   ============================================================ */

export const ProductCard = memo(function ProductCard({
  product,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  const { ref, rotateX, rotateY, transformPerspective } = useTilt<HTMLDivElement>(6);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);

  const handleSpotlight = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  const addToCart = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.stock === 0) return;
    addItem(product.id, 1);
    openCart();
  };

  return (
    <motion.article
      ref={ref}
      style={{ rotateX, rotateY, transformPerspective }}
      initial={{ opacity: 0, scale: 0.9, y: 28 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", stiffness: 240, damping: 24, delay: (index % 4) * 0.07 }}
      whileHover={{ y: -8, rotate: 2, transition: { type: "spring", stiffness: 300, damping: 18 } }}
      onMouseMove={handleSpotlight}
      className="card-glow-border spotlight group relative flex flex-col gap-3 rounded-2xl border-2 border-transparent bg-white/[0.04] p-3.5 backdrop-blur-xl transition-shadow duration-500 hover:shadow-lift hover:shadow-primary/15 sm:gap-4 sm:p-5"
    >
      {/* Badges */}
      <div className="absolute left-3.5 top-3.5 z-10 flex flex-col items-start gap-2 sm:left-4 sm:top-4">
        {product.badges.map((b) => (
          <ProductBadge key={b} badge={b} />
        ))}
      </div>

      {/* Favoritos (funciona mesmo esgotado) */}
      <WishlistButton slug={product.slug} className="absolute right-3.5 top-3.5 z-20 sm:right-4 sm:top-4" />

      <Link to={`/produto/${product.slug}`} className="flex flex-col gap-4">
        {/* Imagem */}
        <div className="relative aspect-square overflow-hidden rounded-xl bg-surface sm:rounded-2xl">
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
          {/* Reflexo */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-base font-bold leading-snug text-text transition-colors duration-300 group-hover:text-primary">
            {product.name}
          </h3>
          <p className="line-clamp-1 text-xs text-dim">{product.tagline}</p>
          <RatingStars rating={product.rating} />

          {/* Estoque */}
          {product.unlimitedStock ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success" />
              Estoque ilimitado
            </p>
          ) : product.stock === 0 ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
              <span className="size-1.5 rounded-full bg-error" />
              Esgotado
            </p>
          ) : product.stock < 10 ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
              <motion.span
                className="size-1.5 rounded-full bg-error"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              Últimas {product.stock} unidades
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success" />
              {product.stock} em estoque
            </p>
          )}

          <PriceTag price={product.price} />
        </div>
      </Link>

      {/* Comprar */}
      <button
        type="button"
        onClick={addToCart}
        disabled={product.stock === 0}
        className={cn(
          "btn-shine mt-auto flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-secondary font-display text-sm font-bold text-[#1a0f00] shadow-glow transition-all duration-300",
          product.stock === 0
            ? "cursor-not-allowed opacity-40 saturate-0 shadow-none hover:translate-y-0 hover:scale-100 hover:shadow-none active:scale-100"
            : "cursor-pointer hover:-translate-y-0.5 hover:shadow-glow-lg active:scale-95",
        )}
      >
        <ShoppingBag className="size-4" />
        {product.stock === 0 ? "Esgotado" : "Comprar"}
      </button>
    </motion.article>
  );
});
