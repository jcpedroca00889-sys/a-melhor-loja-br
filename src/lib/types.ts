import type { LucideIcon } from "lucide-react";

/* ============================================================
   CONTRATO DE DADOS — compartilhado por todos os módulos.
   NÃO alterar campos sem atualizar os consumidores.
   ============================================================ */

export type Badge = "novo" | "promocao" | "popular" | "limitado" | "mais-vendido";

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Preço em reais */
  price: number;
  /** Preço antigo (exibido riscado) — opcional */
  oldPrice?: number;
  categoryId: string;
  /** Emoji cartoon usado na imagem gerada */
  emoji: string;
  /** Cores do gradiente da imagem gerada */
  hueA: string;
  hueB: string;
  /** URLs de imagem (data URIs SVG geradas localmente — sem rede) */
  images: string[];
  /** URLs reais de imagem (fotos/links); vazio = arte SVG gerada do emoji */
  imageUrls?: string[];
  badges: Badge[];
  rating: number; // 0–5
  reviews: number;
  stock: number;
  featured: boolean;
  /** Modo de entrega: auto (entrega instantânea), adm (manual), manual (via chat) */
  deliveryMode?: "auto" | "adm" | "manual";
  /** Campos estendidos (Fase D) */
  sku?: string;
  tags?: string[];
  banner?: string;
  active?: boolean;
  maxQty?: number;
  unlimitedStock?: boolean;
  hideWhenZero?: boolean;
  extras?: { label: string; value: string }[];
  faq?: { q: string; a: string }[];
  garantia?: string;
  termos?: string;
}

export interface Category {
  id: string;
  name: string;
  /** Ícone lucide da categoria */
  icon: LucideIcon;
  /** Emoji cartoon da categoria */
  emoji: string;
  /** Cor exclusiva (hex) — textos/glows */
  color: string;
  /** Classes tailwind do fundo exclusivo, ex: "from-pink-500/25 to-rose-500/10" */
  gradient: string;
  blurb: string;
}

export interface CartItem {
  productId: string;
  qty: number;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  /** Emoji usado como avatar */
  avatar: string;
  rating: number;
  text: string;
}
