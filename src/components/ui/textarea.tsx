import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================
   TEXTAREA — glass + glow laranja no focus (mesmo padrão do Input)
   ============================================================ */

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text shadow-soft outline-none backdrop-blur-md transition-all duration-300 placeholder:text-dim focus:border-primary/50 focus:bg-white/[0.07] focus:shadow-glow focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
