import { create } from "zustand";
import {
  Clapperboard,
  Gamepad2,
  Music2,
  Package,
  Play,
  Puzzle,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Category, Product } from "@/lib/types";
import type { CategoryDto, ProductDto } from "@/lib/api";
import { api } from "@/lib/api";
import { hydrateProduct } from "@/lib/db/image";
import type { ProductRecord } from "@/lib/db/schema";
import categoriesSeed from "@/lib/db/seed/categories.json";
import productsSeed from "@/lib/db/seed/products.json";

/* ============================================================
   CATALOG STORE — catálogo (produtos + categorias) servido pela
   API do servidor. Fallback para os seeds locais se offline,
   para o app continuar utilizável.
   ============================================================ */

export const CATALOG_ICON_KEYS = [
  "Play",
  "Package",
  "Music2",
  "Sparkles",
  "Clapperboard",
  "Video",
  "Gamepad2",
] as const;

const ICONS: Record<string, LucideIcon> = {
  Play,
  Package,
  Music2,
  Sparkles,
  Clapperboard,
  Video,
  Gamepad2,
  // ids das categorias: o fallback offline usa ICONS[c.id]
  netflix: Play,
  amazon: Package,
  spotify: Music2,
  disney: Sparkles,
  hbomax: Clapperboard,
  youtube: Video,
  crunchyroll: Gamepad2,
};

function mapCategory(dto: CategoryDto): Category {
  return {
    id: dto.id,
    name: dto.name,
    icon: ICONS[dto.iconKey] ?? Puzzle,
    emoji: dto.emoji,
    color: dto.color,
    gradient: dto.gradient,
    blurb: dto.blurb,
  };
}

function mapProduct(dto: ProductDto): Product {
  const record: ProductRecord = {
    slug: dto.slug,
    name: dto.name,
    tagline: dto.tagline,
    description: dto.description,
    price: dto.price,
    oldPrice: dto.oldPrice ?? undefined,
    categoryId: dto.categoryId,
    emoji: dto.emoji,
    hueA: dto.hueA,
    hueB: dto.hueB,
    badges: dto.badges,
    rating: dto.rating,
    reviews: dto.reviews,
    // Estoque "infinito" (stock:null no DTO público) vira um sentinela grande —
    // os componentes usam `stock === 0`/`Math.min(qty, stock)` para esgotado
    // e limite de quantidade; com null eles quebrariam.
    stock: dto.stock ?? Number.MAX_SAFE_INTEGER,
    featured: Boolean(dto.featured),
  };
  const product = hydrateProduct(record, dto.imageUrls);
  return {
    ...product,
    deliveryMode: dto.deliveryMode,
    sku: dto.sku,
    tags: dto.tags,
    banner: dto.banner,
    active: dto.active,
    maxQty: dto.maxQty,
    unlimitedStock: dto.unlimitedStock,
    hideWhenZero: dto.hideWhenZero,
    extras: dto.extras,
    faq: dto.faq,
    garantia: dto.garantia,
    termos: dto.termos,
    imageUrls: dto.imageUrls,
  };
}

interface CatalogState {
  products: Product[];
  categories: Category[];
  loading: boolean;
  loaded: boolean;
  error: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  silentRefresh: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  products: [],
  categories: [],
  loading: false,
  loaded: false,
  error: false,

  load: async () => {
    if (get().loaded || get().loading) return;
    await get().refresh();
  },

  refresh: async () => {
    set({ loading: true, error: false });
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api<{ products: ProductDto[] }>("/products"),
        api<{ categories: CategoryDto[] }>("/categories"),
      ]);
      set({
        products: productsRes.products.map(mapProduct),
        categories: categoriesRes.categories.map(mapCategory),
        loading: false,
        loaded: true,
      });
    } catch {
      set({
        products: (productsSeed as ProductRecord[]).map((r) => hydrateProduct(r)),
        categories: categoriesSeed.map((c) => ({ ...c, icon: ICONS[c.id] ?? Puzzle })),
        loading: false,
        loaded: true,
        error: true,
      });
    }
  },

  /* Auto-refresh silencioso: não seta `loading` (evita flicker de skeleton) e,
     em erro, mantém os dados atuais (sem cair para os seeds locais). */
  silentRefresh: async () => {
    const { loaded, loading } = get();
    if (!loaded || loading) return;
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api<{ products: ProductDto[] }>("/products"),
        api<{ categories: CategoryDto[] }>("/categories"),
      ]);
      set({
        products: productsRes.products.map(mapProduct),
        categories: categoriesRes.categories.map(mapCategory),
        error: false,
      });
    } catch {
      // mantém os dados atuais silenciosamente
    }
  },
}));

export function useCatalogProducts(): Product[] {
  return useCatalogStore((s) => s.products);
}

export function useCatalogCategories(): Category[] {
  return useCatalogStore((s) => s.categories);
}

export function useCatalogLoading(): boolean {
  return useCatalogStore((s) => s.loading);
}

export function useCatalogLoaded(): boolean {
  return useCatalogStore((s) => s.loaded);
}
