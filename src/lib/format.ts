/* ============================================================
   FORMAT — helpers de exibição (pt-BR)
   ============================================================ */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata número como moeda BRL: 1234.5 → "R$ 1.234,50" */
export function formatBRL(value: number): string {
  return brl.format(value);
}

/** Formata avaliação: 4.5 → "4,5" */
export function formatRating(value: number): string {
  return value.toFixed(1).replace(".", ",");
}
