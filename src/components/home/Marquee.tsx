/* ============================================================
   MARQUEE — faixa infinita de benefícios (GSAP-free, CSS)
   ============================================================ */

const ITEMS = [
  "⚡ Entrega imediata por e-mail",
  "🎬 Contas de Netflix, Spotify e mais",
  "🔐 Acessos enviados em minutos",
  "⭐ +4.9 de avaliação média",
  "🚀 Novidades toda semana",
  "💬 Suporte rápido no Discord",
];

export function Marquee() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-white/10 bg-white/[0.02] py-4">
      <div className="flex w-max animate-marquee gap-12 whitespace-nowrap will-change-transform">
        {row.map((text, i) => (
          <span
            key={i}
            className="font-display text-sm font-semibold tracking-wide text-muted"
          >
            {text}
          </span>
        ))}
      </div>
      {/* Fade nas bordas */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
