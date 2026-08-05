import { motion } from "framer-motion";
import { ArrowRight, Heart, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Product } from "@/lib/types";
import { useCatalogProducts } from "@/lib/store/catalog-store";
import { useWishlistSlugs, useWishlistStore } from "@/lib/store/wishlist-store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/feedback/PageSkeleton";

/* ============================================================
   WISHLIST PAGE — favoritos salvos no dispositivo (sem login).
   Resolve slugs → produtos do catálogo, mais recentes primeiro.
   ============================================================ */

export default function WishlistPage() {
  const navigate = useNavigate();
  const slugs = useWishlistSlugs();
  const products = useCatalogProducts();
  const clear = useWishlistStore((s) => s.clear);

  /* Catálogo ainda carregando → skeleton (mesmo padrão da ProductPage) */
  if (products.length === 0) return <PageSkeleton />;

  /* Resolve slugs → produtos; recentes primeiro (o store anexa no fim) */
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const items = [...slugs]
    .reverse()
    .map((slug) => bySlug.get(slug))
    .filter((p): p is Product => p !== undefined);

  /* Estado vazio */
  if (items.length === 0) {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <motion.span
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="glass grid size-20 place-items-center rounded-hero text-primary shadow-glow"
        >
          <Heart className="size-9" />
        </motion.span>
        <h1 className="mt-4 text-3xl font-extrabold">
          Sua lista de favoritos está vazia
        </h1>
        <p className="max-w-sm text-muted">
          Toque no coração de um produto para guardá-lo aqui e encontrá-lo
          fácil quando voltar.
        </p>
        <Button size="xl" onClick={() => navigate("/")}>
          Explorar produtos
          <ArrowRight className="size-5" />
        </Button>
      </section>
    );
  }

  return (
    <div className="wrap py-12 sm:py-16">
      {/* Header */}
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-muted">
          <Heart className="size-3.5 text-primary" />
          Favoritos
        </span>
        <h1 className="text-4xl font-extrabold sm:text-5xl">
          Sua lista de <span className="text-gradient">favoritos</span>
        </h1>
        <p className="max-w-md text-muted">
          {items.length} {items.length === 1 ? "produto salvo" : "produtos salvos"} — é só
          clicar no coração para remover.
        </p>
        <button
          type="button"
          onClick={clear}
          className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-error/80 transition-colors duration-300 hover:bg-error/10 hover:text-error"
        >
          <Trash2 className="size-3.5" />
          Limpar lista
        </button>
      </div>

      {/* Grade */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <ProductGrid items={items} />
      </motion.div>
    </div>
  );
}
