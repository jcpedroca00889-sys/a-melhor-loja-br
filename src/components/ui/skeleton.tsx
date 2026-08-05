import { cn } from "@/lib/utils";

/* ============================================================
   SKELETON — loading elegante (nunca usar spinner)
   ============================================================ */

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} {...props} />;
}

export { Skeleton };
