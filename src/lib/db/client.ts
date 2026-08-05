import type { Category, Product, Testimonial } from "@/lib/types";
import type { Order, Subscriber } from "./schema";
import { useCatalogStore } from "@/lib/store/catalog-store";
import testimonialsSeed from "./seed/testimonials.json";

/* ============================================================
   DB CLIENT — camada de acesso ao catálogo e banco local.
   Catálogo: servido pela API (catalog-store), com fallback nos
   seeds locais se offline.
   Pedidos/assinantes: tabelas mutáveis persistidas em localStorage.
   ============================================================ */

const LS_PREFIX = "ss.db.";

/* ---------- storage helpers ---------- */

function loadTable<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveTable<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage indisponível (modo privado) — mantém em memória */
  }
}

/* ---------- catálogo (vindo da API) ---------- */

export const testimonials: Testimonial[] = testimonialsSeed;

/** Busca categoria por id. */
export function getCategory(id: string): Category | undefined {
  return useCatalogStore.getState().categories.find((c) => c.id === id);
}

/** Busca produto por id (o id é o próprio slug). */
export function getProductById(id: string): Product | undefined {
  return useCatalogStore.getState().products.find((p) => p.id === id);
}

/** Busca produto por slug. */
export function getProductBySlug(slug: string): Product | undefined {
  return useCatalogStore.getState().products.find((p) => p.slug === slug);
}

/** Produtos relacionados: mesma categoria (prioriza badges), completa com destaques. */
export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const { products } = useCatalogStore.getState();
  const same = products
    .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  if (same.length >= limit) return same.slice(0, limit);
  const rest = products
    .filter((p) => p.id !== product.id && !same.includes(p))
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  return [...same, ...rest].slice(0, limit);
}

/** Busca instantânea: nome/tagline/categoria, sem diferenciar acentos. */
export function searchProducts(query: string, limit = 8): Product[] {
  const { products, categories } = useCatalogStore.getState();
  const q = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!q) return [];

  return products
    .filter((p) => {
      const cat = categories.find((c) => c.id === p.categoryId);
      const haystack = `${p.name} ${p.tagline} ${cat?.name ?? ""}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return haystack.includes(q);
    })
    .slice(0, limit);
}

/* ---------- tabelas mutáveis ---------- */

/** Gera um id único simples (timestamp + contador). */
let seq = 0;
function genId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export const db = {
  orders: {
    all(): Order[] {
      return loadTable<Order[]>("orders", []);
    },
    add(order: Omit<Order, "id" | "createdAt">): Order {
      const record: Order = { ...order, id: genId("ord"), createdAt: new Date().toISOString() };
      saveTable("orders", [record, ...db.orders.all()]);
      return record;
    },
  },
  subscribers: {
    all(): Subscriber[] {
      return loadTable<Subscriber[]>("subscribers", []);
    },
    /** Cadastra e-mail; retorna false se já existir. */
    add(email: string): boolean {
      const normalized = email.trim().toLowerCase();
      const existing = db.subscribers.all();
      if (existing.some((s) => s.email === normalized)) return false;
      saveTable("subscribers", [
        ...existing,
        { email: normalized, subscribedAt: new Date().toISOString() },
      ]);
      return true;
    },
  },
};
