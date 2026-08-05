import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Copy, KeyRound, LogOut, Package, Save, ShoppingBag, UserRound, XCircle } from "lucide-react";
import { useAuthStore, useUser } from "@/lib/store/auth-store";
import { toast } from "@/lib/store/toast-store";
import { api, type Order, type OrderStatus } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/feedback/PageSkeleton";
import { cn } from "@/lib/utils";

/* ============================================================
   PROFILE PAGE — conta do usuário logado.
   Rota protegida: redireciona para /entrar se não autenticado.
   ============================================================ */

const profileSchema = z.object({
  username: z
    .string()
    .min(3, "Username precisa de pelo menos 3 caracteres")
    .regex(/^[a-zA-Z0-9_-]+$/, "Use apenas letras, números, _ e -"),
});

type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
  senhaAtual: z.string().min(1, "Informe sua senha atual"),
  novaSenha: z.string().min(6, "Senha precisa de pelo menos 6 caracteres"),
});

type PasswordForm = z.infer<typeof passwordSchema>;

const AVATAR_PRESETS = ["🦊", "🐼", "🐸", "🐙", "🦄", "🐯", "👾", "🤖"];

const STATUS_META: Record<OrderStatus, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: "Aguardando aprovação", icon: Clock, className: "bg-amber-400/15 text-amber-400" },
  approved: { label: "Aprovado", icon: CheckCircle2, className: "bg-sky-400/15 text-sky-400" },
  delivered: { label: "Entregue", icon: CheckCircle2, className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelado", icon: XCircle, className: "bg-error/15 text-error" },
};

export default function ProfilePage() {
  const user = useUser();
  const navigate = useNavigate();
  const restoring = useAuthStore((s) => s.restoring);
  const token = useAuthStore((s) => s.token);
  const loading = useAuthStore((s) => s.loading);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const logout = useAuthStore((s) => s.logout);
  const changePassword = useAuthStore((s) => s.changePassword);

  const [avatar, setAvatar] = useState(user?.avatar ?? AVATAR_PRESETS[0]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    mode: "onChange",
    defaultValues: { username: user?.username ?? "" },
  });

  const {
    register: passwordField,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    mode: "onChange",
    defaultValues: { senhaAtual: "", novaSenha: "" },
  });

  /* Busca pedidos reais da conta — roda só com token presente e sessão já
     validada, para não disparar com a sessão ainda em restauração. Se o
     restore demorar, os pedidos carregam depois quando o token chega. */
  useEffect(() => {
    if (restoring || !token) return;
    let cancelled = false;
    api<{ orders: Order[] }>("/orders", { token })
      .then((data) => {
        if (!cancelled) {
          setOrders(data.orders);
          setOrdersError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setOrdersError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, restoring]);

  /* Sessão persistida ainda sendo validada → segura o skeleton, sem bounce */
  if (restoring) return <PageSkeleton />;

  /* Não autenticado → volta para /entrar (rota protegida), lembrando de onde veio */
  if (!user) {
    return <Navigate to="/entrar" replace state={{ from: "/perfil" }} />;
  }

  const onSubmit = handleSubmit(async (data: ProfileForm) => {
    try {
      await updateProfile(data.username.trim(), avatar);
      toast({
        title: "Perfil atualizado! ✨",
        description: "Suas informações foram salvas.",
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "error",
      });
    }
  });

  const handleLogout = async () => {
    await logout();
    toast({ title: "Até logo! 👋", description: "Você saiu da sua conta.", variant: "info" });
    navigate("/");
  };

  const onChangePassword = handlePasswordSubmit(async (data: PasswordForm) => {
    try {
      setChangingPassword(true);
      await changePassword(data.senhaAtual, data.novaSenha);
      toast({ title: "Senha alterada! 🔒", variant: "success" });
      resetPassword();
    } catch (e) {
      toast({
        title: "Não foi possível alterar a senha",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "error",
      });
    } finally {
      setChangingPassword(false);
    }
  });

  return (
    <div className="wrap py-16 sm:py-24">
      <h1 className="text-center text-3xl font-extrabold sm:text-4xl">
        Minha <span className="text-gradient">conta</span>
      </h1>

      <div className="mx-auto mt-12 grid max-w-4xl items-start gap-8 lg:grid-cols-[360px_1fr]">
        {/* Coluna esquerda: perfil + troca de senha */}
        <div className="space-y-8">
        {/* Card de perfil */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="glass-strong rounded-hero p-6 shadow-lift sm:p-8"
        >
          <div className="flex items-center gap-4">
            <motion.div
              animate={{ rotate: [0, -6, 6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="grid size-16 place-items-center rounded-hero bg-gradient-to-br from-primary/30 to-secondary/20 text-4xl shadow-glow"
            >
              {user.avatar}
            </motion.div>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-extrabold">@{user.username}</p>
              <p className="text-xs text-dim">
                Membro desde {new Date(user.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-muted">Seu avatar</span>
              <div className="flex flex-wrap gap-2">
                {AVATAR_PRESETS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAvatar(a)}
                    title={`Avatar ${a}`}
                    className={cn(
                      "grid size-11 place-items-center rounded-2xl text-xl transition-all duration-300 hover:scale-110 active:scale-95",
                      avatar === a
                        ? "bg-gradient-to-br from-primary/30 to-secondary/20 shadow-glow ring-2 ring-primary"
                        : "glass text-muted hover:bg-white/10",
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-muted">Username</span>
              <Input {...field("username")} placeholder="Seu username" autoComplete="username" />
              {errors.username?.message && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5 text-xs font-medium text-error"
                >
                  {errors.username.message}
                </motion.p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                          className="size-1.5 rounded-full bg-current"
                        />
                      ))}
                    </span>
                    Salvando…
                  </span>
                ) : (
                  <>
                    <Save className="size-4" />
                    Salvar alterações
                  </>
                )}
              </Button>
              <Button type="button" variant="destructive" onClick={handleLogout}>
                <LogOut className="size-4" />
                Sair
              </Button>
            </div>
          </form>
        </motion.div>

        {/* Troca de senha */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
          className="glass-strong rounded-hero p-6 shadow-lift sm:p-8"
        >
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <KeyRound className="size-5 text-primary" />
            Trocar senha
          </h2>
          <p className="mt-1 text-sm text-dim">
            Mantenha sua conta protegida com uma senha nova.
          </p>

          <form onSubmit={onChangePassword} className="mt-6 space-y-5">
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-muted">Senha atual</span>
              <Input
                {...passwordField("senhaAtual")}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
              {passwordErrors.senhaAtual?.message && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5 text-xs font-medium text-error"
                >
                  {passwordErrors.senhaAtual.message}
                </motion.p>
              )}
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-muted">Nova senha</span>
              <Input
                {...passwordField("novaSenha")}
                type="password"
                minLength={6}
                autoComplete="new-password"
                placeholder="Mínimo de 6 caracteres"
              />
              {passwordErrors.novaSenha?.message && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5 text-xs font-medium text-error"
                >
                  {passwordErrors.novaSenha.message}
                </motion.p>
              )}
            </div>

            <Button type="submit" disabled={changingPassword}>
              {changingPassword ? (
                <span className="flex items-center gap-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                        className="size-1.5 rounded-full bg-current"
                      />
                    ))}
                  </span>
                  Alterando…
                </span>
              ) : (
                <>
                  <KeyRound className="size-4" />
                  Alterar senha
                </>
              )}
            </Button>
          </form>
        </motion.div>
        </div>

        {/* Pedidos */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
          className="glass rounded-hero p-6 shadow-soft sm:p-8"
        >
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Package className="size-5 text-primary" />
            Meus pedidos
          </h2>

          {ordersError && (
            <p className="mt-4 rounded-2xl bg-error/10 p-4 text-sm text-error">
              Não foi possível carregar seus pedidos. Verifique sua conexão e tente novamente.
            </p>
          )}

          {orders === null && !ordersError && (
            <div className="mt-6 space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-2xl bg-white/[0.03] p-4">
                  <Skeleton className="size-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3 rounded-full" />
                    <Skeleton className="h-3 w-1/2 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}

          {orders !== null && orders.length === 0 && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-white/[0.03] p-8 text-center">
              <motion.span
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="text-5xl"
              >
                🛍️
              </motion.span>
              <p className="font-display font-bold">Nenhum pedido ainda</p>
              <p className="max-w-xs text-sm text-dim">
                Que tal dar uma olhada na vitrine? Tem coisa incrível esperando por você.
              </p>
              <Link to="/" className="mt-1">
                <Button variant="secondary">
                  <ShoppingBag className="size-4" />
                  Explorar produtos
                </Button>
              </Link>
            </div>
          )}

          {orders !== null && orders.length > 0 && (
            <ul className="mt-6 space-y-4">
              {orders.map((order) => {
                const status = STATUS_META[order.status];
                const StatusIcon = status.icon;
                return (
                  <li
                    key={order.id}
                    className="rounded-2xl bg-white/[0.03] p-4 transition-colors duration-300 hover:bg-white/[0.05]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <UserRound className="size-4 text-dim" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-dim">
                          Pedido #{order.id.slice(4).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                            status.className,
                          )}
                        >
                          <StatusIcon className="size-3.5" />
                          {status.label}
                        </span>
                        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-bold text-dim">
                          {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>

                    <ul className="mt-3 space-y-2">
                      {order.items.map((item) => (
                        <li key={item.productId} className="flex items-center gap-3 text-sm">
                          <span className="text-lg">{item.name ?? "🛒"}</span>
                          <span className="flex-1 truncate text-muted">{item.name}</span>
                          <span className="text-dim">
                            {item.qty}× {item.price != null ? formatBRL(item.price) : ""}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                      <span className="text-dim">⚡ Entrega 100% online por e-mail</span>
                      <span className="font-display font-extrabold text-text">
                        {formatBRL(order.total)}
                      </span>
                    </div>

                    {order.status === "delivered" && order.delivery && (
                      <div className="mt-3 rounded-2xl border border-success/20 bg-success/5 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-xs font-bold text-success">
                            <Package className="size-3.5" />
                            Seu produto foi entregue — contas e acessos:
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(order.delivery!.message)
                                .then(() =>
                                  toast({
                                    title: "Copiado! 📋",
                                    description: "Conteúdo da entrega copiado.",
                                    variant: "success",
                                  }),
                                )
                                .catch(() => {});
                            }}
                            className="flex cursor-pointer items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-text transition-colors hover:bg-white/[0.12]"
                          >
                            <Copy className="size-3" />
                            Copiar
                          </button>
                        </div>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-background/60 p-3 font-mono text-xs leading-relaxed text-text">
                          {order.delivery.message}
                        </pre>
                      </div>
                    )}

                    {order.status === "pending" && (
                      <p className="mt-3 flex items-center gap-1.5 rounded-2xl bg-amber-400/10 px-3 py-2 text-xs text-amber-400">
                        <Clock className="size-3.5" />
                        Pagamento em análise — assim que o admin aprovar, você recebe seu produto aqui.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </div>
    </div>
  );
}
