import { Skeleton } from "@/components/ui/skeleton";

/* ============================================================
   PRODUCT SKELETON — loading elegante (nunca usar spinner)
   ============================================================ */

export function ProductSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 border-white/5 bg-white/[0.03] p-5">
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <Skeleton className="h-5 w-3/4 rounded-full" />
      <Skeleton className="h-4 w-1/3 rounded-full" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}
