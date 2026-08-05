import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Ban,
  CheckCircle2,
  Copy,
  Eye,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  api,
  type AdminOrder,
  type AdminUser,
  type OrderStatus,
  type PaginatedUsers,
  type UserOrdersResponse,
} from "@/lib/api";
import { useAuthStore, useUser } from "@/lib/store/auth-store";
import { formatBRL } from "@/lib/format";
import { toast } from "@/lib/store/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ============================================================
   CUSTOMERS TAB (Fase E) — clientes do painel admin.
   Busca (debounce) + ordenação + paginação, banir/desbanir,
   reset de senha (1×), histórico de pedidos em modal.
   Obs: a ordenação por "mais pedidos"/"maior gasto" é feita no
   cliente sobre o total buscado (limite 500) — o servidor só
   ordena por data (asc/desc).
   ============================================================ */

const PAGE_SIZE = 8;

type SortKey = "recent" | "oldest" | "orders" | "spent";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Mais recente" },
  { id: "oldest", label: "Mais antigo" },
  { id: "orders", label: "Mais pedidos" },
  { id: "spent", label: "Maior gasto" },
];

const ROLE_META: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-primary/15 text-primary" },
  user: { label: "Usuário", className: "bg-white/[0.08] text-muted" },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Aguardando", className: "bg-amber-400/15 text-amber-400" },
  approved: { label: "Aprovado", className: "bg-sky-400/15 text-sky-400" },
  delivered: { label: "Entregue", className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelado", className: "bg-error/15 text-error" },
  refunded: { label: "Reembolsado", className: "bg-purple-400/15 text-purple-400" },
};

/** Reembolsados é um payment_status (não um status do pedido). */
const displayStatus = (o: AdminOrder): OrderStatus | "refunded" =>
  o.paymentStatus === "refunded" || o.paymentStatus === "charged_back" ? "refunded" : o.status;

const shortId = (id: string) => `#${id.slice(4).toUpperCase()}`;

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `${d} dias atrás`;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export default function CustomersTab() {
  const me = useUser();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  /* modais */
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [detailOrders, setDetailOrders] = useState<AdminOrder[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmUser, setConfirmUser] = useState<{ user: AdminUser; ban: boolean } | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      if (!silent) setLoading(true);
      setRefreshing(silent);
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", "500"); // o admin busca o total e ordena/pagina no cliente
        params.set("sort", "desc");
        if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
        const data = await api<PaginatedUsers>(`/admin/users?${params.toString()}`, { token });
        setUsers(data.items);
        setTotal(data.total);
      } catch (e) {
        if (!silent) {
          toast({
            title: "Não foi possível carregar os clientes",
            description: e instanceof Error ? e.message : "Tente novamente.",
            variant: "error",
          });
        }
        setUsers((prev) => prev ?? []);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedQ],
  );

  /* busca com debounce */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  /* recarrega quando a busca muda; troca de filtro volta à página 1 */
  useEffect(() => {
    setPage(1);
    void load();
  }, [load]);

  /* auto-refresh leve a cada 30s (preserva filtros) */
  useEffect(() => {
    const t = setInterval(() => {
      void load(true);
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const sorted = useMemo(() => {
    if (!users) return null;
    const copy = [...users];
    switch (sort) {
      case "oldest":
        copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "orders":
        copy.sort((a, b) => b.orderCount - a.orderCount);
        break;
      case "spent":
        copy.sort((a, b) => b.totalSpent - a.totalSpent);
        break;
      default:
        copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return copy;
  }, [users, sort]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageItems = sorted ? sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) : null;

  /* ---------- ações ---------- */

  const openDetail = async (user: AdminUser) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setDetailUser(user);
    setDetailOrders(null);
    setDetailLoading(true);
    try {
      const data = await api<UserOrdersResponse>(`/admin/users/${user.id}/orders`, { token });
      setDetailOrders(data.orders);
    } catch (e) {
      toast({
        title: "Não foi possível carregar o histórico",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
      setDetailOrders([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleBan = async (user: AdminUser, ban: boolean) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setBusy(user.id);
    try {
      await api(`/admin/users/${user.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ banned: ban }),
      });
      toast({
        title: ban ? "Usuário banido 🚫" : "Usuário desbanido ✅",
        description: `@${user.username} ${ban ? "não pode mais acessar a loja." : "pode acessar a loja novamente."}`,
        variant: "success",
      });
      setConfirmUser(null);
      if (detailUser?.id === user.id) {
        setDetailUser({ ...user, banned: ban });
      }
      void load(true);
    } catch (e) {
      toast({
        title: ban ? "Não foi possível banir" : "Não foi possível desbanir",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const requestReset = async (user: AdminUser) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const data = await api<{ ok: true; password: string }>(`/admin/users/${user.id}/reset-password`, {
        method: "POST",
        token,
      });
      setTempPassword(data.password);
      setResetUser(user);
      toast({ title: "Senha redefinida", variant: "success" });
    } catch (e) {
      toast({
        title: "Não foi possível redefinir a senha",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    }
  };

  const messageUser = () => {
    toast({
      title: "Mensagem disponível na próxima atualização",
      description: "O canal de comunicação com o cliente chega na fase de notificações.",
      variant: "info",
    });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado! 📋", variant: "success" });
    } catch {
      /* clipboard indisponível */
    }
  };

  /* ---------- render ---------- */

  return (
    <div className="space-y-5">
      {/* BARRA DE FERRAMENTAS */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {total} {total === 1 ? "cliente" : "clientes"}
          {debouncedQ.trim() && (
            <>
              {" "}
              para <span className="font-bold text-text">“{debouncedQ.trim()}”</span>
            </>
          )}
          .
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por username…"
              className="pl-9"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-text shadow-soft outline-none backdrop-blur-md transition-all duration-300 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} className="bg-surface text-text">
                {o.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* HEADER DA TABELA (desktop) */}
      <div className="hidden grid-cols-[1.5fr_0.8fr_0.8fr_0.7fr_0.9fr_1fr_1fr_auto] items-center gap-3 px-4 text-[11px] font-bold uppercase tracking-widest text-dim lg:grid">
        <span>Usuário</span>
        <span>Perfil</span>
        <span>Status</span>
        <span>Pedidos</span>
        <span>Total gasto</span>
        <span>Último pedido</span>
        <span>Cadastro</span>
        <span className="text-right">Ações</span>
      </div>

      {/* LISTA */}
      <ul className="space-y-3">
        {loading && users === null
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="glass rounded-hero p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 rounded-lg" />
                    <Skeleton className="h-3 w-64 max-w-full rounded-lg" />
                  </div>
                </div>
              </li>
            ))
          : null}

        {!loading && pageItems?.length === 0 && (
          <li className="glass rounded-hero p-10 text-center shadow-soft">
            <motion.span
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="inline-block text-5xl"
            >
              🔍
            </motion.span>
            <h3 className="mt-4 font-display text-lg font-extrabold">
              Nenhum <span className="text-gradient">cliente</span> encontrado
            </h3>
            <p className="mt-1 text-sm text-muted">
              {debouncedQ.trim()
                ? `Tente outro termo para “${debouncedQ.trim()}”.`
                : "Quando alguém se cadastrar na loja, aparece aqui."}
            </p>
          </li>
        )}

        {pageItems?.map((user) => {
          const role = ROLE_META[user.role] ?? ROLE_META.user;
          const banned = user.banned;
          const isMe = user.id === me?.id;
          return (
            <motion.li
              key={user.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-hero p-4 shadow-soft transition-colors hover:bg-white/[0.04]"
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.7fr_0.9fr_1fr_1fr_auto] lg:items-center lg:gap-3">
                {/* usuário */}
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl font-display text-base font-extrabold",
                      banned
                        ? "bg-error/15 text-error"
                        : "bg-gradient-to-br from-primary/20 to-secondary/15 text-primary",
                    )}
                  >
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-display text-sm font-bold text-text">
                      @{user.username}
                      {isMe && (
                        <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-dim">
                          você
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-dim">id: {shortId(user.id)}</p>
                  </div>
                </div>

                {/* perfil */}
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-dim lg:hidden">
                    Perfil
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", role.className)}>
                    {role.label}
                  </span>
                </div>

                {/* status */}
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-dim lg:hidden">
                    Status
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      banned ? "bg-error/15 text-error" : "bg-success/15 text-success",
                    )}
                  >
                    {banned ? <Ban className="size-3" /> : <CheckCircle2 className="size-3" />}
                    {banned ? "Banido" : "Ativo"}
                  </span>
                </div>

                {/* pedidos */}
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-dim lg:hidden">
                    Pedidos
                  </span>
                  <p className="font-display text-sm font-extrabold text-text">{user.orderCount}</p>
                </div>

                {/* total gasto */}
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-dim lg:hidden">
                    Total gasto
                  </span>
                  <p className="font-display text-sm font-bold text-primary">
                    {user.totalSpent > 0 ? formatBRL(user.totalSpent) : "—"}
                  </p>
                </div>

                {/* último pedido */}
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-dim lg:hidden">
                    Último pedido
                  </span>
                  <p className="text-sm text-text">{timeAgo(user.lastOrderAt)}</p>
                </div>

                {/* cadastro */}
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-dim lg:hidden">
                    Cadastro
                  </span>
                  <p className="text-sm text-muted">{shortDate(user.createdAt)}</p>
                </div>

                {/* ações */}
                <div className="flex flex-wrap items-center justify-start gap-1.5 lg:justify-end">
                  <Button size="sm" variant="ghost" title="Histórico" onClick={() => void openDetail(user)}>
                    <Eye className="size-3.5" />
                    <span className="lg:hidden">Histórico</span>
                  </Button>
                  <Button size="sm" variant="ghost" title="Resetar senha" onClick={() => void requestReset(user)}>
                    <KeyRound className="size-3.5" />
                    <span className="lg:hidden">Senha</span>
                  </Button>
                  <Button size="sm" variant="ghost" title="Mensagem" onClick={messageUser}>
                    <Mail className="size-3.5" />
                    <span className="lg:hidden">Mensagem</span>
                  </Button>
                  {!isMe ? (
                    <Button
                      size="sm"
                      variant={banned ? "secondary" : "destructive"}
                      onClick={() => setConfirmUser({ user, ban: !banned })}
                      disabled={busy === user.id}
                    >
                      {banned ? <ShieldCheck className="size-3.5" /> : <Ban className="size-3.5" />}
                      <span className="lg:hidden">{banned ? "Desbanir" : "Banir"}</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>

      {/* PAGINAÇÃO */}
      {sorted !== null && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-dim">
            Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, total)} de {total} · página {safePage} de {pages}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              Anterior
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage >= pages}
              onClick={() => setPage(safePage + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* MODAL — HISTÓRICO */}
      {detailUser && (
        <ModalShell onClose={() => setDetailUser(null)}>
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/15 font-display text-xl font-extrabold text-primary">
              {detailUser.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg font-extrabold">
                @{detailUser.username}
                <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-dim">
                  {ROLE_META[detailUser.role]?.label ?? "Usuário"}
                </span>
              </h3>
              <p className="text-xs text-dim">Cliente desde {shortDate(detailUser.createdAt)}</p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Pedidos" value={String(detailUser.orderCount)} />
            <Stat label="Total gasto" value={detailUser.totalSpent > 0 ? formatBRL(detailUser.totalSpent) : "—"} />
            <Stat label="Último pedido" value={timeAgo(detailUser.lastOrderAt)} />
            <Stat
              label="Status"
              value={detailUser.banned ? "Banido" : "Ativo"}
              valueClass={detailUser.banned ? "text-error" : "text-success"}
            />
          </div>

          <h4 className="mb-3 flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-wider text-muted">
            <UserRound className="size-4" /> Histórico de pedidos
          </h4>

          {detailLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : detailOrders && detailOrders.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.03] p-6 text-center text-sm text-muted">
              Nenhum pedido registrado para este cliente ainda.
            </div>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {detailOrders?.map((o) => {
                const meta = STATUS_META[displayStatus(o)];
                return (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/[0.03] px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-display text-sm font-bold text-text">
                        {shortId(o.id)}
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.className)}>
                          {meta.label}
                        </span>
                      </p>
                      <p className="truncate text-xs text-dim">
                        {new Date(o.createdAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {o.items.reduce((acc, it) => acc + (Number(it.qty) || 1), 0)} item(ns)
                      </p>
                    </div>
                    <p className="font-display text-sm font-extrabold text-primary">{formatBRL(o.total)}</p>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={() => setDetailUser(null)}>
              Fechar
            </Button>
          </div>
        </ModalShell>
      )}

      {/* MODAL — CONFIRMAR BAN/DESBANIR */}
      {confirmUser && (
        <ModalShell onClose={() => setConfirmUser(null)}>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-2xl",
                confirmUser.ban ? "bg-error/15 text-error" : "bg-success/15 text-success",
              )}
            >
              {confirmUser.ban ? <Ban className="size-5" /> : <ShieldCheck className="size-5" />}
            </span>
            <div>
              <h3 className="font-display text-lg font-extrabold">
                {confirmUser.ban ? "Banir cliente?" : "Desbanir cliente?"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {confirmUser.ban ? (
                  <>
                    <span className="font-bold text-text">@{confirmUser.user.username}</span> perderá o acesso à
                    loja imediatamente (compras, pedidos e login).
                  </>
                ) : (
                  <>
                    <span className="font-bold text-text">@{confirmUser.user.username}</span> voltará a ter acesso
                    normal à loja.
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={() => setConfirmUser(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirmUser.ban ? "destructive" : "secondary"}
              disabled={busy === confirmUser.user.id}
              onClick={() => void toggleBan(confirmUser.user, confirmUser.ban)}
            >
              {busy === confirmUser.user.id
                ? "Processando…"
                : confirmUser.ban
                  ? "Banir cliente"
                  : "Desbanir cliente"}
            </Button>
          </div>
        </ModalShell>
      )}

      {/* MODAL — SENHA TEMPORÁRIA */}
      {resetUser && tempPassword && (
        <ModalShell onClose={() => { setResetUser(null); setTempPassword(null); }}>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <KeyRound className="size-5" />
            </span>
            <div>
              <h3 className="font-display text-lg font-extrabold">Senha temporária</h3>
              <p className="mt-1 text-sm text-muted">
                Nova senha de <span className="font-bold text-text">@{resetUser.username}</span> — mostrada{" "}
                <span className="font-bold text-error">apenas uma vez</span>.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="break-all text-center font-mono text-xl font-bold tracking-wide text-primary">
              {tempPassword}
            </p>
          </div>

          <div className="mt-3 rounded-2xl bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-300">
            ⚠️ As sessões ativas deste usuário foram encerradas. Ele precisará entrar novamente com esta senha
            temporária e, de preferência, trocá-la no perfil. Copie agora antes de fechar.
          </div>

          <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setResetUser(null);
                setTempPassword(null);
              }}
            >
              Fechar
            </Button>
            <Button onClick={() => void copyText(tempPassword)}>
              <Copy className="size-4" />
              Copiar senha
            </Button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

/* ---------- peças locais ---------- */

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong relative w-full max-w-2xl rounded-hero p-6 shadow-lift"
      >
        <button
          type="button"
          onClick={onClose}
          title="Fechar"
          className="absolute right-4 top-4 grid size-9 cursor-pointer place-items-center rounded-xl glass text-dim transition-all hover:rotate-90 hover:text-text"
        >
          <X className="size-4" />
        </button>
        {children}
      </motion.div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-dim">{label}</p>
      <p className={cn("mt-0.5 truncate font-display text-sm font-extrabold text-text", valueClass)}>{value}</p>
    </div>
  );
}
