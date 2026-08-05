import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReveal } from "@/lib/hooks/use-reveal";
import { getLenis } from "@/lib/lenis";
import { useCatalogCategories, useCatalogProducts } from "@/lib/store/catalog-store";
import { Skeleton } from "@/components/ui/skeleton";

/* ============================================================
   CATEGORY GRID — cards com ícone cartoon, fundo/cor exclusivos,
   hover: sobe + balança + brilho. Seleção filtra a vitrine.
   ============================================================ */

export function CategoryGrid({
  active,
  onSelect,
}: {
  active: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useReveal<HTMLDivElement>({ stagger: 0.08, y: 24 });
  const categories = useCatalogCategories();
  const products = useCatalogProducts();

  const countFor = (id: string) => products.filter((p) => p.categoryId === id).length;

  const select = (id: string) => {
    onSelect(id);
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo("#produtos", { offset: -80 });
    } else {
      document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section id="categorias" className="wrap py-20">
      <div className="mb-12 flex flex-col items-center gap-3 text-center">
        <span className="glass rounded-full px-4 py-1.5 text-xs font-semibold text-muted">
          🧭 Navegue
        </span>
        <h2 className="text-4xl font-extrabold sm:text-5xl">
          Categorias que <span className="text-gradient">encantam</span>
        </h2>
        <p className="max-w-md text-muted">
          Cada cantinho tem uma vibe própria. Toque para filtrar a vitrine.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 sm:gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-3 rounded-2xl border-2 border-white/10 bg-white/[0.03] p-6">
              <Skeleton className="size-14 rounded-2xl" />
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={ref}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 sm:gap-5"
        >
          {categories.map((cat) => {
          const isActive = active === cat.id;
          return (
            <motion.button
              key={cat.id}
              type="button"
              onClick={() => select(cat.id)}
              whileHover={{ scale: 1.05, y: -6 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 320, damping: 16 }}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center gap-3 overflow-hidden rounded-2xl border-2 p-6 text-center backdrop-blur-xl transition-shadow duration-300",
                isActive
                  ? "bg-white/[0.07]"
                  : "border-white/10 bg-white/[0.03] hover:shadow-glow",
              )}
              style={isActive ? { borderColor: cat.color, boxShadow: `0 0 28px ${cat.color}55` } : undefined}
            >
              {/* Fundo exclusivo */}
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-br transition-opacity duration-300",
                  cat.gradient,
                  isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100",
                )}
              />
              {/* Brilho hover */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120px_circle_at_50%_30%,rgb(255,255,255,0.12),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              {/* Contador */}
              <span
                className={cn(
                  "absolute left-3 top-3 z-10 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all duration-300",
                  isActive ? "scale-105" : "bg-surface-2/80 text-dim group-hover:scale-105",
                )}
                style={isActive ? { backgroundColor: `${cat.color}30`, color: cat.color } : undefined}
              >
                {countFor(cat.id)} itens
              </span>

              {/* Emoji decoração */}
              <span className="absolute right-3 top-3 text-xl opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:rotate-12">
                {cat.emoji}
              </span>

              {/* Ícone com wobble */}
              <motion.span
                whileHover={{ rotate: [0, -10, 10, -6, 0] }}
                transition={{ duration: 0.45 }}
                className={cn(
                  "relative grid h-14 w-14 place-items-center rounded-2xl shadow-soft transition-all duration-300",
                  isActive ? "bg-white/10" : "bg-surface-2 group-hover:scale-105",
                )}
              >
                <cat.icon className="size-7" style={{ color: cat.color }} />
              </motion.span>

              <div className="relative">
                <h3
                  className="font-display text-sm font-bold text-text"
                  style={isActive ? { color: cat.color } : undefined}
                >
                  {cat.name}
                </h3>
                <p className="mt-1 text-[11px] leading-tight text-dim">{cat.blurb}</p>
              </div>
            </motion.button>
          );
        })}
        </div>
      )}
    </section>
  );
}
