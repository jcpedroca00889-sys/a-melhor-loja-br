import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ============================================================
   WISHLIST STORE — favoritos (Zustand, persistido em localStorage)
   Guarda slugs de produtos; funciona sem login (visita),
   seguindo o mesmo padrão do cart-store.
   ============================================================ */

interface WishlistState {
  slugs: string[];
  /** Adiciona se ausente, remove se presente */
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set) => ({
      slugs: [],
      toggle: (slug) =>
        set((s) => ({
          slugs: s.slugs.includes(slug)
            ? s.slugs.filter((x) => x !== slug)
            : [...s.slugs, slug],
        })),
      remove: (slug) =>
        set((s) => ({ slugs: s.slugs.filter((x) => x !== slug) })),
      clear: () => set({ slugs: [] }),
    }),
    { name: "ss.db.wishlist", partialize: (s) => ({ slugs: s.slugs }) },
  ),
);

export function useWishlistCount(): number {
  return useWishlistStore((s) => s.slugs.length);
}

export function useWishlistSlugs(): string[] {
  return useWishlistStore((s) => s.slugs);
}

export function useIsWishlisted(slug: string): boolean {
  return useWishlistStore((s) => s.slugs.includes(slug));
}
