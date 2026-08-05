import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { animated, useSpring } from "@react-spring/web";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { getProductById } from "@/lib/db";
import { formatBRL } from "@/lib/format";
import { getLenis } from "@/lib/lenis";
import { useCartItems, useCartOpen, useCartStore } from "@/lib/store/cart-store";
import { Button } from "@/components/ui/button";

/* ============================================================
   CART DRAWER — gaveta lateral com spring, steppers de
   quantidade e total animado via react-spring
   ============================================================ */

export default function CartDrawer() {
  const open = useCartOpen();
  const items = useCartItems();
  const closeCart = useCartStore((s) => s.closeCart);
  const setQty = useCartStore((s) => s.setQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const navigate = useNavigate();

  const rows = items.flatMap((item) => {
    const product = getProductById(item.productId);
    return product ? [{ item, product }] : [];
  });

  const subtotal = rows.reduce((s, r) => s + r.product.price * r.item.qty, 0);
  const total = subtotal;

  const { num } = useSpring({
    from: { num: 0 },
    to: { num: subtotal },
    config: { mass: 1, tension: 240, friction: 26 },
  });

  /* Esc fecha; trava o scroll suave enquanto aberta */
  useEffect(() => {
    if (!open) return;
    getLenis()?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      getLenis()?.start();
    };
  }, [open, closeCart]);

  const goCheckout = () => {
    closeCart();
    navigate("/checkout");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm"
            onClick={closeCart}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-[65] flex h-dvh w-full max-w-md flex-col bg-surface/95 shadow-lift backdrop-blur-2xl"
            role="dialog"
            aria-label="Carrinho de compras"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                <ShoppingBag className="size-5 text-primary" />
                Seu carrinho
                {rows.length > 0 && (
                  <span className="glass rounded-full px-2.5 py-0.5 text-sm font-bold text-secondary">
                    {rows.reduce((n, r) => n + r.item.qty, 0)}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={closeCart}
                aria-label="Fechar carrinho"
                className="grid size-10 cursor-pointer place-items-center rounded-full bg-surface-2 text-dim transition-all hover:rotate-90 hover:text-text"
              >
                <X className="size-5" />
              </button>
            </div>

            {rows.length === 0 ? (
              /* Estado vazio */
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <motion.span
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="text-6xl"
                >
                  🛒
                </motion.span>
                <p className="font-display text-xl font-bold text-text">
                  Seu carrinho está vazio
                </p>
                <p className="max-w-xs text-sm text-dim">
                  Que tal dar uma olhada na vitrine? Os produtos favoritos da
                  galera estão te esperando.
                </p>
                <Button
                  onClick={() => {
                    closeCart();
                    navigate("/");
                  }}
                >
                  Ver produtos
                </Button>
              </div>
            ) : (
              <>
                {/* Lista */}
                <ul className="no-scrollbar flex-1 space-y-3 overflow-y-auto p-6">
                  <AnimatePresence initial={false}>
                    {rows.map(({ item, product }) => (
                      <motion.li
                        key={item.productId}
                        layout
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28 }}
                        className="glass flex gap-3 rounded-2xl p-3"
                      >
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="size-20 shrink-0 rounded-xl object-cover"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 font-display text-sm font-bold text-text">
                              {product.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeItem(item.productId)}
                              aria-label={`Remover ${product.name}`}
                              className="cursor-pointer text-dim transition-colors hover:text-error"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          <p className="mt-0.5 text-xs font-semibold text-primary">
                            {formatBRL(product.price)}
                          </p>
                          <div className="mt-auto flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setQty(item.productId, item.qty - 1)}
                              aria-label="Diminuir quantidade"
                              className="grid size-7 cursor-pointer place-items-center rounded-lg bg-surface-2 transition-all hover:bg-primary hover:text-background active:scale-90"
                            >
                              <Minus className="size-3.5" />
                            </button>
                            <span className="w-6 text-center font-display text-sm font-bold">
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setQty(item.productId, Math.min(product.stock, item.qty + 1))
                              }
                              aria-label="Aumentar quantidade"
                              className="grid size-7 cursor-pointer place-items-center rounded-lg bg-surface-2 transition-all hover:bg-primary hover:text-background active:scale-90"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                {/* Rodapé */}
                <div className="space-y-3 border-t border-white/10 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                  <div className="flex items-center justify-between text-sm text-dim">
                    <span>Subtotal</span>
                    <animated.span className="font-display font-bold text-text">
                      {num.to((n) => formatBRL(n))}
                    </animated.span>
                  </div>
                  <p className="flex items-center gap-1.5 rounded-2xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                    ⚡ Entrega 100% online — você recebe as contas por e-mail em minutos.
                  </p>
                  <div className="flex items-center justify-between border-t border-white/10 pt-3">
                    <span className="font-display text-base font-bold text-text">Total</span>
                    <span className="font-display text-2xl font-extrabold text-gradient">
                      {formatBRL(total)}
                    </span>
                  </div>
                  <Button size="xl" className="w-full" onClick={goCheckout}>
                    Finalizar compra
                  </Button>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
