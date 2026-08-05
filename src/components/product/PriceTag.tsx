import { motion } from "framer-motion";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ============================================================
   PRICE TAG — preço único, sem descontos (hover animado)
   ============================================================ */

export function PriceTag({
  price,
  className = "",
  size = "md",
}: {
  price: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeCls =
    size === "lg"
      ? "text-3xl"
      : size === "sm"
        ? "text-base"
        : "text-xl";

  return (
    <div className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <motion.span
        whileHover={{ scale: 1.08 }}
        transition={{ type: "spring", stiffness: 400, damping: 18 }}
        className={cn(
          "inline-block font-display font-extrabold text-text transition-colors duration-300 hover:text-primary",
          sizeCls,
        )}
      >
        {formatBRL(price)}
      </motion.span>
    </div>
  );
}
