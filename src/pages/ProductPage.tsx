import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Mail, Minus, Plus, ShieldCheck, ShoppingBag, Zap } from "lucide-react";
import { getCategory, getProductBySlug, getRelatedProducts } from "@/lib/db";
import { formatBRL } from "@/lib/format";
import { useCatalogProducts } from "@/lib/store/catalog-store";
import { useCartStore } from "@/lib/store/cart-store";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/feedback/PageSkeleton";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductBadge } from "@/components/product/ProductBadge";
import { PriceTag } from "@/components/product/PriceTag";
import { RatingStars } from "@/components/product/RatingStars";
import { ProductGrid } from "@/components/product/ProductGrid";
import { WishlistButton } from "@/components/product/WishlistButton";

/* ============================================================
   PRODUCT PAGE — galeria + painel de compra + relacionados
   ============================================================ */

const PERKS = [
  { icon: Mail, label: "Entrega por e-mail em minutos" },
  { icon: Zap, label: "Contas de Netflix, Spotify e mais" },
  { icon: ShieldCheck, label: "Compra protegida Satoshii" },
];

export default function ProductPage() {
  const { slug } = useParams();
  const products = useCatalogProducts();
  /* Catálogo carregando e produto ainda não encontrado → skeleton */
  const product = slug ? getProductBySlug(slug) : undefined;

  const [qty, setQty] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);

  if (!product && products.length === 0) return <PageSkeleton />;
  if (!product) return <Navigate to="/" replace />;

  const category = getCategory(product.categoryId);
  const related = getRelatedProducts(product, 4);
  const soldOut = !product.unlimitedStock && product.stock === 0;
  const qtyMax = product.maxQty && product.maxQty > 0 ? product.maxQty : undefined;

  const handleAdd = () => {
    if (soldOut) return;
    addItem(product.id, qty);
    openCart();
  };

  return (
    <div className="wrap py-12 sm:py-16">
      {/* Breadcrumb */}
      <nav className="mb-10 flex flex-wrap items-center gap-1.5 text-sm text-dim">
        <Link to="/" className="transition-colors hover:text-primary">
          Início
        </Link>
        <ChevronRight className="size-4" />
        <Link to="/" className="transition-colors hover:text-primary">
          {category?.name ?? "Loja"}
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-muted">{product.name}</span>
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Galeria */}
        <ProductGallery images={product.images} name={product.name} badges={product.badges} />

        {/* Painel de compra */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {product.badges.map((b) => (
              <ProductBadge key={b} badge={b} />
            ))}
          </div>

          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">{product.name}</h1>
          <p className="mt-3 text-lg text-muted">{product.tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RatingStars rating={product.rating} size={16} />
            <span className="text-sm text-dim">
              {product.rating.toFixed(1)} · {product.reviews} avaliações
            </span>
          </div>

          <div className="mt-6 flex items-end gap-4">
            <PriceTag price={product.price} size="lg" />
          </div>

          <p className="mt-6 leading-relaxed text-muted">{product.description}</p>

          {/* Estoque */}
          {soldOut ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-error/10 px-4 py-2 text-sm font-semibold text-error">
              <span className="inline-block size-2 rounded-full bg-error" />
              Esgotado
            </p>
          ) : product.unlimitedStock ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2 text-sm font-semibold text-success">
              ✅ Estoque ilimitado — prontinho para despachar
            </p>
          ) : product.stock < 10 ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-error/10 px-4 py-2 text-sm font-semibold text-error">
              <motion.span
                className="inline-block size-2 rounded-full bg-error"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              Últimas {product.stock} unidades! 🏃
            </p>
          ) : (
            <p className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2 text-sm font-semibold text-success">
              ✅ {product.stock} em estoque — prontinho para despachar
            </p>
          )}

          {/* Quantidade + CTA */}
          <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="glass flex items-center gap-1 rounded-full p-1.5">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="grid size-10 cursor-pointer place-items-center rounded-full bg-surface-2 transition-all hover:bg-primary hover:text-background active:scale-90"
                aria-label="Diminuir quantidade"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-10 text-center font-display text-lg font-bold">{qty}</span>
              <button
                type="button"
                onClick={() =>
                  setQty((q) =>
                    Math.min(qtyMax ?? product.stock ?? Number.MAX_SAFE_INTEGER, q + 1),
                  )
                }
                disabled={qty >= (qtyMax ?? product.stock ?? Number.MAX_SAFE_INTEGER)}
                className="grid size-10 cursor-pointer place-items-center rounded-full bg-surface-2 transition-all hover:bg-primary hover:text-background active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-2 disabled:hover:text-text disabled:active:scale-100"
                aria-label="Aumentar quantidade"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <Button
              size="xl"
              onClick={handleAdd}
              disabled={soldOut}
              className="flex-1 sm:flex-none"
            >
              <ShoppingBag className="size-5" />
              {soldOut ? "Esgotado" : `Adicionar — ${formatBRL(product.price * qty)}`}
            </Button>

            {/* Favoritos */}
            <WishlistButton slug={product.slug} size="lg" />
          </div>

          {qtyMax && (
            <p className="mt-2 text-[11px] text-dim">Máximo de {qtyMax} unidade(s) por pedido.</p>
          )}

          {/* Perks */}
          <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3">
            {PERKS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="glass flex items-center gap-3 rounded-2xl p-3.5 transition-colors hover:bg-white/[0.07]"
              >
                <Icon className="size-5 shrink-0 text-secondary" />
                <span className="text-xs font-medium text-muted">{label}</span>
              </div>
            ))}
          </div>

          {/* Extras (Fase D) */}
          {product.extras && product.extras.length > 0 && (
            <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
              <ul className="divide-y divide-white/[0.06]">
                {product.extras.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 bg-white/[0.03] px-4 py-3">
                    <span className="text-sm text-muted">{e.label}</span>
                    <span className="text-sm font-bold text-text">{e.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      </div>

      {/* Garantia + Termos (Fase D) */}
      {(product.garantia || product.termos) && (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {product.garantia && (
            <div className="glass rounded-hero p-6 shadow-soft">
              <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
                <ShieldCheck className="size-5 text-primary" />
                Garantia
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{product.garantia}</p>
            </div>
          )}
          {product.termos && (
            <div className="glass rounded-hero p-6 shadow-soft">
              <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
                <ShieldCheck className="size-5 text-primary" />
                Termos de uso
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{product.termos}</p>
            </div>
          )}
        </div>
      )}

      {/* FAQ (Fase D) */}
      {product.faq && product.faq.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            Perguntas <span className="text-gradient">frequentes</span>
          </h2>
          <div className="mt-6 space-y-3">
            {product.faq.map((f, i) => (
              <details key={i} className="group glass rounded-2xl p-5 shadow-soft">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-sm font-bold text-text [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-dim transition-transform duration-300 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Relacionados */}
      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="mb-8 text-3xl font-extrabold sm:text-4xl">
            Quem viu também <span className="text-gradient">amou</span>
          </h2>
          <ProductGrid items={related} />
        </section>
      )}
    </div>
  );
}
