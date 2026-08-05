import { testimonials } from "@/lib/db";
import { useReveal } from "@/lib/hooks/use-reveal";
import { RatingStars } from "@/components/product/RatingStars";

/* ============================================================
   TESTIMONIALS — depoimentos com estrelas e hover animado
   ============================================================ */

export function Testimonials() {
  const ref = useReveal<HTMLDivElement>({ stagger: 0.09, y: 32 });

  return (
    <section className="wrap py-20">
      <div className="mb-12 flex flex-col items-center gap-3 text-center">
        <span className="glass rounded-full px-4 py-1.5 text-xs font-semibold text-muted">
          💬 Depoimentos
        </span>
        <h2 className="text-4xl font-extrabold sm:text-5xl">
          Quem entrou no mundo, <span className="text-gradient">amou</span>
        </h2>
      </div>

      <div
        ref={ref}
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {testimonials.map((t) => (
          <figure
            key={t.id}
            className="glass group flex flex-col rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1.5 hover:bg-white/[0.07] hover:shadow-glow"
          >
            <RatingStars rating={t.rating} size={15} />
            <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-muted">
              “{t.text}”
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-2xl shadow-soft transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                {t.avatar}
              </span>
              <div>
                <p className="font-display text-sm font-bold text-text">
                  {t.name}
                </p>
                <p className="text-xs text-dim">{t.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
