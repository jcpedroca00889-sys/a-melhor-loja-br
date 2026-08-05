import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import { ProductSkeleton } from "./ProductSkeleton";

/* ============================================================
   PRODUCT GRID — grade responsiva com stagger + skeletons
   ============================================================ */

export function ProductGrid({
  items,
  loading = false,
  limit,
  skeletonCount = 8,
}: {
  items: Product[];
  loading?: boolean;
  limit?: number;
  skeletonCount?: number;
}) {
  const list = limit ? items.slice(0, limit) : items;

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 xl:grid-cols-4">
      {list.map((p, i) => (
        <ProductCard key={p.id} product={p} index={i} />
      ))}
    </div>
  );
}
