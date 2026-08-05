import { useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { DiscordIcon, InstagramIcon, XIcon, YoutubeIcon } from "./SocialIcons";

/* ============================================================
   FOOTER — grande, glass, social animado, glow discreto
   ============================================================ */

const COLUMNS: Array<{ title: string; links: string[] }> = [
  { title: "Loja", links: ["Canecas Mágicas", "Camisetas", "Acessórios", "Decoração", "Colecionáveis"] },
  { title: "Ajuda", links: ["FAQ", "Entrega online", "Suporte", "Contato"] },
  { title: "Sobre", links: ["Quem somos", "Nosso mundo", "Carreiras", "Imprensa"] },
];

const SOCIALS = [
  { icon: DiscordIcon, label: "Discord", href: "https://discord.gg/satoshii-store" },
  { icon: InstagramIcon, label: "Instagram", href: "#" },
  { icon: XIcon, label: "X (Twitter)", href: "#" },
  { icon: YoutubeIcon, label: "YouTube", href: "#" },
];

export default function Footer() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "added" | "duplicate" | "sending">("idle");

  const onSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await api<{ ok: boolean; duplicate?: boolean }>("/subscribers", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setStatus(res.duplicate ? "duplicate" : "added");
      if (!res.duplicate) setEmail("");
    } catch {
      /* offline: usa o banco local como fallback */
      const added = db.subscribers.add(email);
      setStatus(added ? "added" : "duplicate");
      if (added) setEmail("");
    }
  };

  return (
    <footer className="glass relative mt-auto overflow-hidden border-t border-white/10">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="wrap relative py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Marca + social */}
          <div>
            <span className="font-display text-xl font-extrabold sm:text-2xl">
              SATOSHII <span className="text-gradient">STORE</span>
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-dim">
              A loja cartoon premium onde cada clique parece uma cena de
              desenho animado. Produtos encantadores e entregas 100% online,
              direto no seu e-mail.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {SOCIALS.map(({ icon: Icon, label, href }) => (
                <motion.a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  title={label}
                  whileHover={{ y: -4, scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  className="glass grid h-11 w-11 place-items-center rounded-2xl text-muted transition-colors duration-300 hover:bg-white/10 hover:text-primary hover:shadow-glow"
                >
                  <Icon className="size-5" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Colunas de links */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-sm font-bold uppercase tracking-widest text-text">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((label) => (
                  <li key={label}>
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="group inline-flex items-center gap-1.5 text-sm text-dim transition-all duration-300 hover:translate-x-1 hover:text-text"
                    >
                      <ChevronRight className="size-3.5 text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Newsletter */}
        <div className="mt-14 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:flex-row sm:justify-between sm:p-8">
          <div>
            <h4 className="font-display text-lg font-bold">
              Entre para o clube <span className="text-gradient">Satoshii</span> 🎉
            </h4>
            <p className="mt-1 text-sm text-dim">
              Novidades, lançamentos e histórias divertidas — sem spam.
            </p>
          </div>
          {status === "added" ? (
            <motion.p
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl bg-success/15 px-5 py-3 text-sm font-semibold text-success"
            >
              Obrigado por se inscrever! 🧡
            </motion.p>
          ) : status === "duplicate" ? (
            <motion.p
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl bg-error/15 px-5 py-3 text-sm font-semibold text-error"
            >
              Você já está no clube Satoshii 😄
            </motion.p>
          ) : (
            <form onSubmit={onSubscribe} className="flex w-full max-w-md gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text outline-none backdrop-blur-md transition-all duration-300 placeholder:text-dim focus:border-primary/50 focus:shadow-glow focus:ring-4 focus:ring-primary/10"
              />
              <button
                type="submit"
                className="btn-shine h-12 shrink-0 cursor-pointer rounded-xl bg-gradient-to-br from-primary to-secondary px-6 font-display text-sm font-bold text-[#1a0f00] shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow-lg active:scale-95"
              >
                Assinar
              </button>
            </form>
          )}
        </div>

        {/* Barra inferior */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-sm text-dim sm:flex-row">
          <p>© {new Date().getFullYear()} SATOSHII STORE — Feito com 🧡 e muitos pixels.</p>
          <div className="flex items-center gap-6">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="transition-colors duration-300 hover:text-primary"
            >
              Termos
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="transition-colors duration-300 hover:text-primary"
            >
              Privacidade
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
