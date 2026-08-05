import { useCatalogCategories, useCatalogProducts } from "@/lib/store/catalog-store";
import { cn } from "@/lib/utils";
import { ProductGrid } from "./ProductGrid";
import { Skeleton } from "@/components/ui/skeleton";

/* ============================================================
   PRODUCTS SECTION — vitrine com filtro por categoria
   (chips "Todas" + 5 categorias; grade re-anima ao trocar)
   ============================================================ */

const chipBase =
  "cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 active:scale-95";
const chipIdle = "glass border-transparent text-muted hover:text-text";
const chipActiveAll =
  "btn-shine border-transparent bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow";
const chipActiveCat = "border-transparent bg-white/[0.07]";

export function ProductsSection({
  activeCategory,
  onSelect,
}: {
  activeCategory: string | null;
  onSelect: (id: string | null) => void;
}) {
  const categories = useCatalogCategories();
  const products = useCatalogProducts();
  const activeCat = activeCategory
    ? categories.find((c) => c.id === activeCategory)
    : undefined;
  const visible = activeCategory
    ? products.filter((p) => p.categoryId === activeCategory)
    : products;

  return (
    <section id="produtos" className="wrap scroll-mt-28 py-20">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <span className="glass rounded-full px-4 py-1.5 text-xs font-semibold text-muted">
          🛍️ Vitrine
        </span>
        <h2 className="text-4xl font-extrabold sm:text-5xl">
          {activeCat ? (
            <>
              Categoria{" "}
              <span className="text-gradient">{activeCat.name}</span>
            </>
          ) : (
            <>
              Todos os <span className="text-gradient">produtos</span>
            </>
          )}
        </h2>
        <p className="max-w-md text-muted">
          {activeCat
            ? `${visible.length} ${visible.length === 1 ? "produto" : "produtos"} nessa categoria — escolha a dedo.`
            : "Nossa seleção completa — cada item é um capricho."}
        </p>
      </div>

      {/* Chips de filtro */}
      <div className="mb-10 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(chipBase, activeCategory === null ? chipActiveAll : chipIdle)}
        >
          ✨ Todas
        </button>
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              className={cn(chipBase, isActive ? chipActiveCat : chipIdle)}
              style={
                isActive
                  ? { borderColor: cat.color, color: cat.color, boxShadow: `0 0 18px ${cat.color}50` }
                  : undefined
              }
            >
              {cat.emoji} {cat.name}
            </button>
          );
        })}
      </div>

      {/* Grade re-anima ao trocar categoria */}
      <div key={activeCategory ?? "all"}>
        {products.length === 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass flex flex-col gap-3 rounded-hero p-4">
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="h-4 w-2/3 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <ProductGrid items={visible} />
        )}
      </div>
    </section>
  );
}
