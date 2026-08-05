import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useReveal } from "@/lib/hooks/use-reveal";

/* ============================================================
   FINAL CTA — chamada final com glass forte e glow
   ============================================================ */

export function FinalCTA() {
  const ref = useReveal<HTMLDivElement>({ y: 36 });
  const navigate = useNavigate();

  return (
    <section className="wrap py-20">
      <div
        ref={ref}
        className="glass-strong relative overflow-hidden rounded-hero p-12 text-center shadow-lift sm:p-16"
      >
        <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />

        <span className="animate-float inline-block text-5xl">🧡</span>
        <h2 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
          Pronto para entrar no{" "}
          <span className="text-gradient">mundo Satoshii</span>?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-muted">
          Crie sua conta grátis e venha explorar a{" "}
          <strong className="text-secondary">loja cartoon premium</strong>.
          Sem pegadinhas, só alegria.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Button size="xl" onClick={() => navigate("/criar-conta")}>
            Criar conta grátis
          </Button>
          <Button
            size="xl"
            variant="secondary"
            onClick={() =>
              window.open("https://discord.gg/satoshii-store", "_blank", "noopener")
            }
          >
            Falar com a gente
          </Button>
        </div>
      </div>
    </section>
  );
}
