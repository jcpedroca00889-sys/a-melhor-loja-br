import { Skeleton } from "@/components/ui/skeleton";

/* ============================================================
   PAGE SKELETON — fallback de rotas lazy (elegante, sem spinner)
   ============================================================ */

export function PageSkeleton() {
  return (
    <div className="wrap flex flex-col gap-10 py-24">
      <div className="flex flex-col items-center gap-5">
        <Skeleton className="h-16 w-2/3 max-w-xl rounded-2xl" />
        <Skeleton className="h-5 w-1/2 max-w-sm rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <Skeleton className="h-5 w-3/4 rounded-full" />
            <Skeleton className="h-4 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
