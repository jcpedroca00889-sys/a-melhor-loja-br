import type { CartItem } from "@/lib/types";

/* ============================================================
   DB SCHEMA — registros persistidos no banco local.
   Catálogo = seeds JSON (read-only). Pedidos/assinantes =
   tabelas mutáveis em localStorage.
   ============================================================ */

/** Registro de produto no seed (sem imagens — geradas no load). */
export interface ProductRecord {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  oldPrice?: number;
  categoryId: string;
  emoji: string;
  hueA: string;
  hueB: string;
  badges: string[];
  rating: number;
  reviews: number;
  stock: number;
  featured: boolean;
}

/** Pedido persistido na tabela `orders`. */
export interface Order {
  id: string;
  createdAt: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  shipping: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    city: string;
    state: string;
  };
  /** Cartão mascarado — só os 4 últimos dígitos são gravados. */
  cardLast4: string;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
}

/** Assinante da newsletter. */
export interface Subscriber {
  email: string;
  subscribedAt: string;
}
