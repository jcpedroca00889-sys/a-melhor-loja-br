import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ============================================================
   BADGE — variantes para estado/promoção dos produtos
   ============================================================ */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-xs font-bold tracking-wide transition-all duration-300",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-r from-primary to-secondary text-[#1a0f00] shadow-glow",
        promo: "border-error/30 bg-error/15 text-error",
        new: "border-success/30 bg-success/15 text-success",
        popular: "border-secondary/30 bg-secondary/15 text-secondary",
        limited: "border-primary/40 bg-primary/15 text-primary",
        outline: "glass text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
