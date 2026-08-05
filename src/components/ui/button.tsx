import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ============================================================
   BUTTON — padrão shadcn/ui adaptado ao design system SATOSHII STORE
   default = gradiente laranja + shine; hover sobe/escala; click comprime
   ============================================================ */

const buttonVariants = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap font-display font-bold tracking-wide outline-none transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "btn-shine bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-glow-lg active:scale-95",
        secondary:
          "glass text-text hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-white/10 hover:shadow-soft active:scale-95",
        ghost:
          "text-muted hover:bg-white/5 hover:text-text active:scale-95",
        outline:
          "border-2 border-primary/40 text-primary hover:border-primary hover:bg-primary/10 hover:shadow-glow active:scale-95",
        destructive:
          "bg-error/15 text-error border border-error/30 hover:bg-error/25 active:scale-95",
      },
      size: {
        sm: "h-9 rounded-xl px-4 text-sm",
        default: "h-11 rounded-xl px-6 text-sm",
        lg: "h-13 rounded-2xl px-8 text-base",
        xl: "h-16 rounded-2xl px-10 text-lg",
        icon: "h-10 w-10 rounded-xl",
        "icon-lg": "h-12 w-12 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
