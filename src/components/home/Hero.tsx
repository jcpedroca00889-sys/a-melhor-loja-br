import { Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMouseParallax } from "@/lib/hooks/use-mouse-parallax";
import { getLenis } from "@/lib/lenis";

/* Hero3D carrega three.js — lazy para não pesar o chunk inicial */
const Hero3D = lazy(() =>
  import("./Hero3D").then((m) => ({ default: m.Hero3D })),
);

/* ============================================================
   HERO — headline gigante + CTAs + parallax + 3D + stats
   ============================================================ */

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.25 } },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 140, damping: 20 },
  },
};

export function Hero() {
  const { x, y } = useMouseParallax(22);
  const { x: xReverse, y: yReverse } = useMouseParallax(-14);

  const scrollToProducts = () => {
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo("#produtos", { offset: -80 });
    } else {
      document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative flex min-h-dvh items-center overflow-hidden pb-20 pt-24 sm:pt-32">
      {/* Glows com parallax de mouse */}
      <motion.div
        style={{ x, y }}
        className="pointer-events-none absolute -right-28 top-16 h-[420px] w-[420px] rounded-full bg-primary/15 blur-3xl"
      />
      <motion.div
        style={{ x: xReverse, y: yReverse }}
        className="pointer-events-none absolute -left-24 bottom-10 h-[380px] w-[380px] rounded-full bg-secondary/10 blur-3xl"
      />

      <div className="wrap relative z-10 grid items-center gap-10 lg:grid-cols-2 lg:gap-6">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.span
            variants={item}
            className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-muted"
          >
            <Sparkles className="size-4 text-primary" />
            Loja oficial SATOSHII STORE
          </motion.span>

          <motion.h1
            variants={item}
            className="mt-6 text-[clamp(2.25rem,7vw,4.5rem)] font-extrabold leading-[1.06] sm:leading-[1.04]"
          >
            Seu pequeno mundo{" "}
            <span className="text-gradient">cartoon</span> premium
          </motion.h1>

          <motion.p variants={item} className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Produtos encantadores, cores vibrantes e uma experiência que
            parece cena de desenho animado. Bem-vindo ao lugar onde comprar
            volta a ser divertido.
          </motion.p>

          <motion.div variants={item} className="mt-8 flex flex-wrap items-center gap-3 sm:mt-9 sm:gap-4">
            <Button size="xl" onClick={scrollToProducts}>
              Explorar loja
              <ArrowRight className="size-5" />
            </Button>
            <a href="https://discord.gg/satoshii-store" target="_blank" rel="noopener noreferrer">
              <Button size="xl" variant="secondary">
                Entrar no Discord
              </Button>
            </a>
          </motion.div>

          <motion.div
            variants={item}
            className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 sm:mt-12 sm:gap-12"
          >
            {[
              { value: "15+", label: "Produtos exclusivos" },
              { value: "100%", label: "Entrega online" },
              { value: "4.9★", label: "Avaliação média" },
            ].map((s) => (
              <div key={s.label} className="group">
                <span className="font-display text-3xl font-extrabold text-gradient transition-transform duration-300 group-hover:scale-110 inline-block">
                  {s.value}
                </span>
                <p className="mt-1 text-xs text-dim">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.4 }}
          className="relative hidden aspect-square lg:block"
        >
          <Suspense
            fallback={
              <div className="absolute inset-0 grid place-items-center">
                <span className="glass-strong animate-float text-8xl">🛸</span>
              </div>
            }
          >
            <Hero3D />
          </Suspense>
        </motion.div>
      </div>
    </section>
  );
}
