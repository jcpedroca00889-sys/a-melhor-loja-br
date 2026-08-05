import type { VariantProps } from "class-variance-authority";
import { Badge, badgeVariants } from "@/components/ui/badge";
import type { Badge as BadgeType } from "@/lib/types";

/* ============================================================
   PRODUCT BADGE — Novo / Promoção / Popular / Limitado / Mais Vendido
   ============================================================ */

const BADGE_META: Record<
  BadgeType,
  { label: string; variant: VariantProps<typeof badgeVariants>["variant"] }
> = {
  novo: { label: "Novo", variant: "new" },
  promocao: { label: "Promoção", variant: "promo" },
  popular: { label: "Popular", variant: "popular" },
  limitado: { label: "Limitado", variant: "limited" },
  "mais-vendido": { label: "Mais Vendido", variant: "default" },
};

export function ProductBadge({
  badge,
  className = "",
}: {
  badge: BadgeType;
  className?: string;
}) {
  const meta = BADGE_META[badge];
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  );
}
