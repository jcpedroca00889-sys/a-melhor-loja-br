import type { Product } from "@/lib/types";
import type { ProductRecord } from "./schema";

/* ============================================================
   DB IMAGE — gera as imagens SVG (data-URI) dos produtos.
   Seeds guardam spec (emoji + cores); as imagens são montadas
   no load para manter o JSON enxuto e 100% offline.
   ============================================================ */

const SPARKLES: Array<[number, number]> = [
  [150, 200],
  [720, 150],
  [780, 640],
  [130, 680],
  [560, 120],
  [220, 760],
];

const BUBBLES: Array<[number, number, number]> = [
  [120, 420, 46],
  [780, 330, 62],
  [640, 760, 38],
  [260, 150, 30],
];

/** Gera um SVG 900x900 cartoon: gradiente escuro + glow + emoji + sparkles/bolhas. */
export function makeImage(hueA: string, hueB: string, emoji: string, variant: number): string {
  const angle = 120 + variant * 30;
  const emojiRot = variant * 12 - 12;
  const sparkleText = SPARKLES.map(
    ([x, y], i) =>
      `<text x='${x}' y='${y}' font-size='${i % 2 === 0 ? 42 : 30}' fill='${hueB}' opacity='0.75'>✦</text>`,
  ).join("");
  const bubbleShapes = BUBBLES.map(
    ([cx, cy, r]) =>
      `<circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='${hueB}' stroke-width='3' opacity='0.35'/>`,
  ).join("");

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#18181B'/>
      <stop offset='100%' stop-color='${hueA}59'/>
    </linearGradient>
    <radialGradient id='glow' cx='50%' cy='44%' r='46%'>
      <stop offset='0%' stop-color='${hueB}' stop-opacity='0.5'/>
      <stop offset='100%' stop-color='${hueB}' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <rect width='900' height='900' fill='url(#g)'/>
  <g transform='rotate(${angle} 450 450)'>
    <circle cx='450' cy='410' r='265' fill='url(#glow)'/>
  </g>
  <g transform='rotate(${emojiRot} 450 450)'>
    <text x='450' y='470' font-size='320' text-anchor='middle' dominant-baseline='central' font-family='Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif'>${emoji}</text>
  </g>
  ${bubbleShapes}
  ${sparkleText}
  <circle cx='450' cy='450' r='440' fill='none' stroke='${hueB}' stroke-width='2' opacity='0.18'/>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Converte um registro do seed em Product com as 4 imagens geradas.
 *  Quando `imageUrls` tem URLs reais (fotos/links), usa-as como `images`;
 *  caso contrário mantém o fallback SVG gerado do emoji. */
export function hydrateProduct(record: ProductRecord, imageUrls?: string[]): Product {
  return {
    id: record.slug,
    slug: record.slug,
    name: record.name,
    tagline: record.tagline,
    description: record.description,
    price: record.price,
    oldPrice: record.oldPrice,
    categoryId: record.categoryId,
    emoji: record.emoji,
    hueA: record.hueA,
    hueB: record.hueB,
    images:
      imageUrls && imageUrls.length > 0
        ? imageUrls
        : [0, 1, 2, 3].map((v) => makeImage(record.hueA, record.hueB, record.emoji, v)),
    badges: record.badges as Product["badges"],
    rating: record.rating,
    reviews: record.reviews,
    stock: record.stock,
    featured: record.featured,
  };
}
