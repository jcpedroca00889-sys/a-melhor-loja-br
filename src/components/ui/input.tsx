import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================
   INPUT — glass + glow laranja no focus
   ============================================================ */

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text shadow-soft outline-none backdrop-blur-md transition-all duration-300 placeholder:text-dim focus:border-primary/50 focus:bg-white/[0.07] focus:shadow-glow focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
