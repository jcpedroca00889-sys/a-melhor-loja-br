import { motion } from "framer-motion";
import { useCountUp } from "@/lib/hooks/use-count-up";
import { useReveal } from "@/lib/hooks/use-reveal";

/* ============================================================
   ABOUT — narrativa da marca + stats com count-up + emojis flutuantes
   ============================================================ */

const FLOATING_EMOJIS = [
  { emoji: "☕", className: "top-6 left-8 animate-float" },
  { emoji: "🚀", className: "top-16 right-10 animate-float-slow" },
  { emoji: "🧸", className: "bottom-14 left-14 animate-float-slow" },
  { emoji: "🎧", className: "bottom-8 right-16 animate-float" },
  { emoji: "🦊", className: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-8xl sm:text-9xl" },
];

function Stat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const count = useCountUp(value, 1100);
  return (
    <div className="group text-center">
      <motion.span
        whileHover={{ scale: 1.12, y: -3 }}
        transition={{ type: "spring", stiffness: 300, damping: 16 }}
        className="inline-block font-display text-3xl font-extrabold text-gradient sm:text-4xl"
      >
        {Math.round(count)}
        {suffix}
      </motion.span>
      <p className="mt-1 text-sm text-dim">{label}</p>
    </div>
  );
}

export function AboutSection() {
  const ref = useReveal<HTMLDivElement>({ y: 40 });

  return (
    <section id="sobre" ref={ref} className="wrap grid items-center gap-14 py-20 lg:grid-cols-2">
      <div>
        <span className="glass inline-flex rounded-full px-4 py-1.5 text-xs font-semibold text-muted">
          💛 Sobre nós
        </span>
        <h2 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
          Um mundo onde{" "}
          <span className="text-gradient">comprar é divertido</span>
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          A SATOSHII STORE nasceu de uma ideia simples: por que comprar online
          precisa ser tão sem graça? Juntamos o capricho do design premium
          com a alegria do cartoon — e criamos um lugar onde cada clique tem
          personalidade.
        </p>
        <p className="mt-4 leading-relaxed text-dim">
          Cada produto é escolhido à mão (ou à pata), cada entrega sai daqui
          em minutos direto no seu e-mail, e cada pedido é tratado como a cena
          favorita do episódio. É esse cuidado nos mínimos detalhes que nos
          faz diferentes.
        </p>
        <div className="mt-10 grid grid-cols-3 gap-4 sm:gap-6">
          <Stat value={15} suffix="+" label="Produtos exclusivos" />
          <Stat value={5} suffix="min" label="Para receber no e-mail" />
          <Stat value={98} suffix="%" label="Clientes felizes" />
        </div>
      </div>

      {/* Card visual */}
      <div className="relative hidden aspect-square lg:block">
        <div className="glass-strong absolute inset-0 overflow-hidden rounded-hero shadow-lift">
          <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,rgba(255,138,0,0.14),transparent_70%)]" />
          {FLOATING_EMOJIS.map(({ emoji, className }) => (
            <span
              key={emoji}
              className={`absolute select-none ${className}`}
              aria-hidden
            >
              {emoji}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
