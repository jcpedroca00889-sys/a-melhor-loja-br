import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Search, Sparkles, X } from "lucide-react";
import { getCategory, searchProducts } from "@/lib/db";
import { formatBRL } from "@/lib/format";
import { getLenis } from "@/lib/lenis";
import { useSearchOpen, useUIStore } from "@/lib/store/ui-store";
import { useTypewriter } from "@/lib/hooks/use-typewriter";

/* ============================================================
   SEARCH OVERLAY — busca fullscreen com typewriter no placeholder,
   sugestões instantâneas e lupa animada no focus
   ============================================================ */

const SUGGESTIONS = ["caneca rocket", "mini dragão", "fone blast", "camiseta toon"];

export default function SearchOverlay() {
  const open = useSearchOpen();
  const closeSearch = useUIStore((s) => s.closeSearch);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { text } = useTypewriter(["caneca rocket…", "mini dragão…", "fone blast…", "camiseta toon…"]);

  const results = useMemo(() => (query.trim() ? searchProducts(query.trim()) : []), [query]);

  /* Foco automático + reset ao abrir */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [open]);

  /* Esc fecha; trava o scroll suave enquanto aberto */
  useEffect(() => {
    if (!open) return;
    getLenis()?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      getLenis()?.start();
    };
  }, [open, closeSearch]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[70] bg-background/85 backdrop-blur-2xl"
          onClick={closeSearch}
        >
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="wrap pt-24 sm:pt-32"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-2xl">
              {/* Barra de busca */}
              <div className="glass-strong flex items-center gap-4 rounded-hero px-6 shadow-lift">
                <motion.span
                  animate={{ rotate: focused ? 180 : 0, scale: focused ? 1.2 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  className="text-primary"
                >
                  <Search className="size-6" />
                </motion.span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder={query === "" ? text : undefined}
                  aria-label="Buscar produtos"
                  className="h-16 flex-1 bg-transparent text-lg text-text outline-none placeholder:text-dim"
                />
                <motion.button
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={closeSearch}
                  aria-label="Fechar busca"
                  className="grid size-10 cursor-pointer place-items-center rounded-full bg-surface-2 text-dim transition-colors hover:text-text"
                >
                  <X className="size-5" />
                </motion.button>
              </div>

              {/* Resultados / sugestões */}
              <AnimatePresence mode="wait">
                {query.trim() ? (
                  <motion.ul
                    key="results"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.22 }}
                    className="no-scrollbar mt-6 max-h-[55vh] space-y-2 overflow-y-auto"
                  >
                    {results.length === 0 ? (
                      <li className="glass rounded-2xl p-10 text-center">
                        <span className="text-4xl">🔍</span>
                        <p className="mt-3 font-display font-bold text-text">
                          Nada encontrado para “{query}”
                        </p>
                        <p className="mt-1 text-sm text-dim">
                          Tente outra palavra — ou explore as sugestões.
                        </p>
                      </li>
                    ) : (
                      results.map((r, i) => (
                        <motion.li
                          key={r.id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                        >
                          <Link
                            to={`/produto/${r.slug}`}
                            onClick={closeSearch}
                            className="glass group flex items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-white/[0.08]"
                          >
                            <img
                              src={r.images[0]}
                              alt={r.name}
                              className="size-14 shrink-0 rounded-xl object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-sm font-bold text-text">
                                {r.name}
                              </p>
                              <p className="mt-0.5 text-xs text-dim">
                                {getCategory(r.categoryId)?.name ?? "Loja"}
                              </p>
                            </div>
                            <span className="font-display text-sm font-extrabold text-primary">
                              {formatBRL(r.price)}
                            </span>
                            <ArrowUpRight className="size-4 text-dim transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                          </Link>
                        </motion.li>
                      ))
                    )}
                  </motion.ul>
                ) : (
                  <motion.div
                    key="suggestions"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-8 text-center"
                  >
                    <p className="flex items-center justify-center gap-2 text-sm font-semibold text-dim">
                      <Sparkles className="size-4 text-secondary" />
                      Tente uma dessas ideias
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setQuery(s)}
                          className="glass cursor-pointer rounded-full px-4 py-2 text-sm text-muted transition-all hover:-translate-y-0.5 hover:bg-white/[0.08] hover:text-text"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
