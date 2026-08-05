import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, LayoutDashboard, LogIn, LogOut, UserRound, X } from "lucide-react";
import { motion } from "framer-motion";
import { useNavOpen, useUIStore } from "@/lib/store/ui-store";
import { useAuthStore, useUser } from "@/lib/store/auth-store";
import { useWishlistCount } from "@/lib/store/wishlist-store";
import { getLenis } from "@/lib/lenis";

/* ============================================================
   MOBILENAV — drawer fullscreen mobile (stagger + lenis stop)
   ============================================================ */

const LINKS = [
  { label: "Início", to: "/", anchor: undefined },
  { label: "Categorias", to: "/", anchor: "categorias" },
  { label: "Sobre", to: "/", anchor: "sobre" },
  { label: "Discord", to: "https://discord.gg/satoshii-store", external: true },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: 32 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 22 },
  },
};

export default function MobileNav() {
  const open = useNavOpen();
  const setNavOpen = useUIStore((s) => s.setNavOpen);
  const navigate = useNavigate();
  const user = useUser();
  const logout = useAuthStore((s) => s.logout);
  const wishlistCount = useWishlistCount();

  const handleLogout = async () => {
    close();
    await logout();
    navigate("/");
  };

  useEffect(() => {
    const lenis = getLenis();
    if (open) {
      lenis?.stop();
    } else {
      lenis?.start();
    }
    return () => {
      lenis?.start();
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setNavOpen]);

  const close = () => setNavOpen(false);

  const go = (to: string, anchor?: string) => {
    close();
    if (to.startsWith("http")) {
      window.open(to, "_blank", "noopener");
      return;
    }
    navigate(to);
    if (anchor) {
      setTimeout(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    }
  };

  return (
    <motion.div
      key="mobile-nav"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={close}
      className="fixed inset-0 z-[60] flex justify-end bg-background/80 backdrop-blur-2xl lg:hidden"
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong flex h-full w-full max-w-sm flex-col p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift sm:w-96"
      >
        <div className="mb-8 flex items-center justify-between">
          <span className="font-display text-lg font-extrabold sm:text-xl">
            SATOSHII <span className="text-gradient">STORE</span>
          </span>
          <button
            type="button"
            onClick={close}
            title="Fechar"
            className="grid h-11 w-11 place-items-center rounded-2xl glass text-muted transition-all duration-300 hover:rotate-90 hover:bg-white/10 hover:text-primary hover:shadow-glow"
          >
            <X className="size-5" />
          </button>
        </div>

        <motion.nav
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex flex-1 flex-col gap-2"
        >
          {LINKS.map((link) => (
            <motion.button
              key={link.label}
              variants={itemVariants}
              type="button"
              onClick={() => go(link.to, link.anchor)}
              className="group flex items-center justify-between rounded-2xl px-4 py-3 text-left font-display text-2xl font-bold text-muted transition-all duration-300 hover:translate-x-1 hover:bg-white/5 hover:text-primary"
            >
              {link.label}
              <span className="text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                →
              </span>
            </motion.button>
          ))}

          {/* Favoritos (rota própria, com contagem) */}
          <motion.button
            variants={itemVariants}
            type="button"
            onClick={() => go("/favoritos")}
            className="group flex items-center justify-between rounded-2xl px-4 py-3 text-left font-display text-2xl font-bold text-muted transition-all duration-300 hover:translate-x-1 hover:bg-white/5 hover:text-primary"
          >
            <span className="flex items-center gap-3">
              <Heart className="size-5 text-secondary" />
              Favoritos
            </span>
            {wishlistCount > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary px-1.5 text-xs font-extrabold text-[#1a0f00] shadow-glow">
                {wishlistCount}
              </span>
            )}
          </motion.button>
        </motion.nav>

        {/* Conta */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="border-t border-white/10 pt-4"
        >
          {user ? (
            <>
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary/30 to-secondary/20 text-xl shadow-glow">
                  {user.avatar}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold text-text">@{user.username}</p>
                  <p className="truncate text-xs text-dim">
                    {user.role === "admin" ? "Administrador" : "Cliente Satoshii"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <motion.button
                  variants={itemVariants}
                  type="button"
                  onClick={() => go("/perfil")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl glass px-4 py-3 font-display text-sm font-bold text-muted transition-all duration-300 hover:bg-white/10 hover:text-primary active:scale-95"
                >
                  <UserRound className="size-4" />
                  Meu perfil
                </motion.button>
                {user.role === "admin" && (
                  <motion.button
                    variants={itemVariants}
                    type="button"
                    onClick={() => go("/admin")}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/[0.05] px-4 py-3 font-display text-sm font-bold text-secondary transition-all duration-300 hover:bg-white/10 active:scale-95"
                  >
                    <LayoutDashboard className="size-4" />
                    Admin
                  </motion.button>
                )}
                <motion.button
                  variants={itemVariants}
                  type="button"
                  onClick={handleLogout}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-error/10 px-4 py-3 font-display text-sm font-bold text-error transition-all duration-300 hover:bg-error/20 active:scale-95"
                >
                  <LogOut className="size-4" />
                  Sair
                </motion.button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <motion.button
                variants={itemVariants}
                type="button"
                onClick={() => go("/criar-conta")}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-secondary px-4 py-3 font-display text-sm font-bold text-[#1a0f00] shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow-lg active:scale-95"
              >
                <UserRound className="size-4" />
                Criar conta
              </motion.button>
              <motion.button
                variants={itemVariants}
                type="button"
                onClick={() => go("/entrar")}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl glass px-4 py-3 font-display text-sm font-bold text-muted transition-all duration-300 hover:bg-white/10 hover:text-primary active:scale-95"
              >
                <LogIn className="size-4" />
                Entrar
              </motion.button>
            </div>
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-sm text-dim"
        >
          Feito com <span className="text-primary">🧡</span> e muitos pixels
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
