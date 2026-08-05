import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Menu, Search, ShoppingBag, User, UserRound, Heart } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCartCount, useCartStore } from "@/lib/store/cart-store";
import { useWishlistCount } from "@/lib/store/wishlist-store";
import { useNavOpen, useUIStore } from "@/lib/store/ui-store";
import { useAuthStore, useUser } from "@/lib/store/auth-store";
import { cn } from "@/lib/utils";
import MobileNav from "./MobileNav";

/* ============================================================
   HEADER — transparente → glass ao rolar; shrink 80→64px
   ============================================================ */

const NAV_LINKS = [
  { label: "Início", to: "/", anchor: undefined },
  { label: "Categorias", to: "/", anchor: "categorias" },
  { label: "Sobre", to: "/", anchor: "sobre" },
  { label: "Discord", to: "https://discord.gg/satoshii-store", external: true },
];

function CartBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <motion.span
      key={count}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 18 }}
      className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary px-1 text-[10px] font-extrabold text-[#1a0f00] shadow-glow"
    >
      {count}
    </motion.span>
  );
}

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const count = useCartCount();
  const wishlistCount = useWishlistCount();
  const navOpen = useNavOpen();
  const openCart = useCartStore((s) => s.openCart);
  const openSearch = useUIStore((s) => s.openSearch);
  const setNavOpen = useUIStore((s) => s.setNavOpen);
  const user = useUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Fecha o dropdown ao clicar fora */
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-user-menu]")) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate("/");
  };

  const goToAnchor = (anchor?: string) => {
    if (!anchor) return;
    // espera a troca de rota para a âncora existir
    setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
    }, 60);
  };

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.1 }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-out",
        scrolled ? "py-2" : "py-4",
      )}
    >
      <div className="wrap">
        <div
          className={cn(
            "flex items-center justify-between rounded-hero transition-all duration-500 ease-out",
            scrolled
              ? "glass-strong h-14 px-4 shadow-soft sm:px-6"
              : "h-20 px-2 sm:px-4",
          )}
        >
          {/* Logo */}
          <Link
            to="/"
            className="group flex items-center gap-2 font-display text-xl font-extrabold tracking-tight transition-transform duration-300 hover:scale-105"
          >
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow transition-shadow duration-300 group-hover:shadow-glow-lg">
              S
            </span>
            <span className="hidden text-lg sm:inline xl:text-xl">
              SATOSHII <span className="text-gradient">STORE</span>
            </span>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => {
              if (link.external) {
                return (
                  <a
                    key={link.label}
                    href={link.to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative px-3 py-2 font-display text-sm font-semibold text-muted transition-all duration-300 hover:scale-105 hover:text-primary"
                  >
                    {link.label}
                    <span className="absolute inset-x-3 bottom-0 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-to-r from-primary to-secondary transition-transform duration-300 group-hover:scale-x-100" />
                  </a>
                );
              }
              return (
                <NavLink
                  key={link.label}
                  to={link.to}
                  onClick={() => goToAnchor(link.anchor)}
                  className="group relative px-3 py-2 font-display text-sm font-semibold text-muted transition-all duration-300 hover:scale-105 hover:text-primary"
                >
                  {({ isActive }) => (
                    <>
                      {link.label}
                      <span
                        className={cn(
                          "absolute inset-x-3 bottom-0 h-0.5 origin-left rounded-full bg-gradient-to-r from-primary to-secondary transition-transform duration-300 group-hover:scale-x-100",
                          isActive && !link.anchor
                            ? "scale-x-100"
                            : "scale-x-0",
                        )}
                      />
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Ações */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openSearch}
              title="Pesquisar"
              className="group relative grid h-11 w-11 place-items-center rounded-2xl glass text-muted transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:text-primary hover:shadow-glow active:scale-95"
            >
              <Search className="size-5 transition-transform duration-300 group-hover:rotate-12" />
            </button>
            {user ? (
              <div data-user-menu className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  title={user.username}
                  aria-expanded={userMenuOpen}
                  className="group relative grid h-11 w-11 place-items-center rounded-2xl glass text-xl transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:shadow-glow active:scale-95"
                >
                  <span className="pointer-events-none select-none">{user.avatar}</span>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-success" />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      className="glass-strong absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl p-1.5 shadow-lift"
                    >
                      <div className="border-b border-white/10 px-3 py-2.5">
                        <p className="truncate font-display text-sm font-bold text-text">
                          @{user.username}
                        </p>
                        <p className="truncate text-xs text-dim">
                          {user.role === "admin" ? "Administrador" : "Cliente Satoshii"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/perfil");
                        }}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors duration-300 hover:bg-white/5 hover:text-text"
                      >
                        <UserRound className="size-4" />
                        Meu perfil
                      </button>
                      {user.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate("/admin");
                          }}
                          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors duration-300 hover:bg-white/5 hover:text-text"
                        >
                          <LayoutDashboard className="size-4 text-secondary" />
                          Painel admin
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-error transition-colors duration-300 hover:bg-error/10"
                      >
                        <LogOut className="size-4" />
                        Sair
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/entrar")}
                title="Entrar"
                className="group relative hidden h-11 w-11 place-items-center rounded-2xl glass text-muted transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:text-primary hover:shadow-glow active:scale-95 sm:grid"
              >
                <User className="size-5 transition-transform duration-300 group-hover:scale-110" />
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/favoritos")}
              title="Favoritos"
              aria-label="Favoritos"
              className="relative grid h-11 w-11 place-items-center rounded-2xl glass text-muted transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:text-primary hover:shadow-glow active:scale-95"
            >
              <Heart className="size-5" />
              <CartBadge count={wishlistCount} />
            </button>
            <button
              type="button"
              onClick={openCart}
              title="Carrinho"
              className="relative grid h-11 w-11 place-items-center rounded-2xl glass text-muted transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:text-primary hover:shadow-glow active:scale-95"
            >
              <ShoppingBag className="size-5" />
              <CartBadge count={count} />
            </button>
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              title="Menu"
              className="grid h-11 w-11 place-items-center rounded-2xl glass text-muted transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:text-primary hover:shadow-glow active:scale-95 lg:hidden"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {navOpen && <MobileNav />}
      </AnimatePresence>
    </motion.header>
  );
}
