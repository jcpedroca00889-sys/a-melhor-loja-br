import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/lib/types";

/* ============================================================
   CART STORE — estado global do carrinho (Zustand).
   Persistido em localStorage (tabela `cart` do banco local) —
   sobrevive a reloads.
   ============================================================ */

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (productId: string, qty?: number) => void;
  removeItem: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      addItem: (productId, qty = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.productId === productId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.productId === productId ? { ...i, qty: i.qty + qty } : i,
              ),
            };
          }
          return { items: [...s.items, { productId, qty }] };
        }),
      removeItem: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      setQty: (productId, qty) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.productId === productId ? { ...i, qty: Math.max(0, qty) } : i))
            .filter((i) => i.qty > 0),
        })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: "ss.db.cart",
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

/** Selector memoizado: quantidade total de itens */
export function useCartCount(): number {
  return useCartStore((s) => s.items.reduce((n, i) => n + i.qty, 0));
}

/** Selector memoizado: carrinho aberto/fechado */
export function useCartOpen(): boolean {
  return useCartStore((s) => s.isOpen);
}

/** Selector memoizado: itens do carrinho */
export function useCartItems(): CartItem[] {
  return useCartStore((s) => s.items);
}
