import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ClipboardCheck,
  Package,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  api,
  getAdminAlerts,
  type AdminAlerts,
  type AdminLogEntry,
  type AdminOrder,
  type OrderStatus,
  type OverviewReport,
  type SalesPeriod,
  type SalesPoint,
  type TopCustomerRow,
  type TopProductRow,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";
import { useCatalogProducts } from "@/lib/store/catalog-store";
import { formatBRL } from "@/lib/format";
import { toast } from "@/lib/store/toast-store";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ============================================================
   DASHBOARD ADMIN (Fase B) — primeira tab do painel.
   KPIs (overview), gráfico de vendas dia/semana/mês (SVG próprio),
   top produtos/clientes, últimos pedidos e atividades recentes.
   Auto-refresh leve do overview a cada 30s.
   ============================================================ */

const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Aguardando", className: "bg-amber-400/15 text-amber-400" },
  approved: { label: "Aprovado", className: "bg-sky-400/15 text-sky-400" },
  delivered: { label: "Entregue", className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelado", className: "bg-error/15 text-error" },
};

const PERIODS: { id: SalesPeriod; label: string }[] = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
];

/** "R$ 1.234,56" → "R$ 1,2k" / "R$ 42" (eixo Y do gráfico) */
function compactBRL(n: number): string {
  if (n >= 1000) {
    return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `${d} dias atrás`;
}

const orderDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ---------- humanizador de logs ---------- */

function describeLog(log: AdminLogEntry): { emoji: string; text: string } {
  const id = log.entityId ?? "";
  const short = id.length > 8 ? `#${id.slice(4).toUpperCase()}` : id;
  switch (log.action) {
    case "order.status": {
      let fromTo = "";
      try {
        const d = JSON.parse(log.details ?? "{}") as { from?: string; to?: string };
        if (d.from && d.to) fromTo = ` · ${d.from} → ${d.to}`;
      } catch {
        /* details não-JSON — segue sem contexto */
      }
      return { emoji: "↗️", text: `Alterou o pedido ${short}${fromTo}` };
    }
    case "order.simulate_payment":
      return { emoji: "🔁", text: `Simulou pagamento do pedido ${short}` };
    case "account.create":
      return { emoji: "🔑", text: `Criou conta de estoque ${id ? `para ${id}` : ""}`.trim() };
    case "account.generate":
      return { emoji: "🎲", text: `Gerou contas em massa para ${id}` };
    case "account.delete":
      return { emoji: "🗑️", text: `Excluiu a conta de estoque ${short}` };
    case "account.batch_delete": {
      let deleted = 0;
      try {
        const d = JSON.parse(log.details ?? "{}") as { deleted?: number };
        if (typeof d.deleted === "number") deleted = d.deleted;
      } catch {
        /* details não-JSON — segue sem contagem */
      }
      return { emoji: "🗑️", text: `Excluiu ${deleted} conta(s) de estoque em lote` };
    }
    case "order.refund":
      return { emoji: "💸", text: `Reembolsou o pedido ${short}` };
    case "order.redeliver":
      return { emoji: "🔁", text: `Reenviou a entrega do pedido ${short}` };
    case "user.role": {
      let fromTo = "";
      try {
        const d = JSON.parse(log.details ?? "{}") as { from?: string; to?: string };
        if (d.from && d.to) fromTo = ` (${d.from} → ${d.to})`;
      } catch {
        /* details não-JSON — segue sem contexto */
      }
      return { emoji: "👤", text: `Alterou o perfil do usuário ${short}${fromTo}` };
    }
    case "user.ban": {
      let banned = true;
      try {
        const d = JSON.parse(log.details ?? "{}") as { banned?: boolean };
        if (typeof d.banned === "boolean") banned = d.banned;
      } catch {
        /* assume ban */
      }
      return banned
        ? { emoji: "🚫", text: `Baniu o usuário ${short}` }
        : { emoji: "✅", text: `Desbaniu o usuário ${short}` };
    }
    case "user.reset_password":
      return { emoji: "🔑", text: `Redefiniu a senha do usuário ${short}` };
    case "backup.restore":
      return { emoji: "♻️", text: "Restaurou o banco de dados a partir de um backup" };
    case "coupon.create":
    case "coupon.update":
    case "coupon.delete": {
      let code = id ? `"${id}"` : "";
      try {
        const d = JSON.parse(log.details ?? "{}") as { code?: string };
        if (d.code) code = `"${d.code}"`;
      } catch {
        /* details não-JSON — mantém o id */
      }
      const verb = log.action === "coupon.create" ? "Criou" : log.action === "coupon.update" ? "Editou" : "Excluiu";
      const emoji = log.action === "coupon.create" ? "➕" : log.action === "coupon.update" ? "✏️" : "🗑️";
      return { emoji, text: `${verb} o cupom ${code}` };
    }
    case "product.create":
      return { emoji: "➕", text: `Criou o produto "${id}"` };
    case "product.update":
      return { emoji: "✏️", text: `Editou o produto "${id}"` };
    case "product.delete":
      return { emoji: "🗑️", text: `Excluiu o produto "${id}"` };
    case "category.create":
      return { emoji: "➕", text: `Criou a categoria "${id}"` };
    case "category.update":
      return { emoji: "✏️", text: `Editou a categoria "${id}"` };
    case "category.delete":
      return { emoji: "🗑️", text: `Excluiu a categoria "${id}"` };
    case "settings.update":
      return { emoji: "⚙️", text: "Atualizou as configurações da loja" };
    default:
      return { emoji: "📝", text: log.action };
  }
}

/* ---------- componente principal ---------- */

export default function DashboardTab({ onGoToOrders }: { onGoToOrders?: () => void }) {
  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [sales, setSales] = useState<SalesPoint[] | null>(null);
  const [period, setPeriod] = useState<SalesPeriod>("day");
  const [topProducts, setTopProducts] = useState<TopProductRow[] | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomerRow[] | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrder[] | null>(null);
  const [logs, setLogs] = useState<AdminLogEntry[] | null>(null);
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const products = useCatalogProducts();

  const loadAll = useCallback(async (silent = false) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!silent) setLoading(true);
    setRefreshing(silent);

    const [o, tp, tc, ro, lg, al] = await Promise.allSettled([
      api<{ overview: OverviewReport }>("/admin/reports/overview", { token }),
      api<{ items: TopProductRow[] }>("/admin/reports/top-products?limit=5", { token }),
      api<{ items: TopCustomerRow[] }>("/admin/reports/top-customers?limit=5", { token }),
      api<{ orders: AdminOrder[]; total: number }>("/admin/orders?page=1&limit=6", { token }),
      api<{ items: AdminLogEntry[]; total: number }>("/admin/logs?page=1&limit=6", { token }),
      getAdminAlerts(token),
    ]);

    if (o.status === "fulfilled") setOverview(o.value.overview);
    if (tp.status === "fulfilled") setTopProducts(tp.value.items);
    if (tc.status === "fulfilled") setTopCustomers(tc.value.items);
    if (ro.status === "fulfilled") setRecentOrders(ro.value.orders);
    if (lg.status === "fulfilled") setLogs(lg.value.items);
    if (al.status === "fulfilled") setAlerts(al.value);

    if (!silent) {
      const failed = [o, tp, tc, ro, lg].filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast({
          title: "Dashboard incompleto",
          description: `${failed} bloco(s) não carregou(ram). Verifique sua conexão e tente "Atualizar".`,
          variant: "error",
        });
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  /* carga inicial */
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /* gráfico de vendas — muda com o período; `silent` suprime o toast (auto-refresh) */
  const loadSales = useCallback(
    async (silent = false) => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      try {
        const res = await api<{ series: SalesPoint[] }>(`/admin/reports/sales?period=${period}`, { token });
        setSales(res.series);
      } catch {
        if (!silent) {
          toast({
            title: "Não foi possível carregar o gráfico",
            description: "Tente novamente em instantes.",
            variant: "error",
          });
        }
      }
    },
    [period],
  );

  /* gráfico — carrega ao montar e ao trocar período */
  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  /* auto-refresh leve a cada 30s (silencioso) — atualiza KPIs, listas e o gráfico */
  useEffect(() => {
    const t = setInterval(() => {
      void loadAll(true);
      void loadSales(true);
    }, 30_000);
    return () => clearInterval(t);
  }, [loadAll, loadSales]);

  const kpis = useMemo(() => {
    if (!overview) return [];
    const catalogActive = products.filter((p) => p.stock > 0).length;
    const catalogOut = products.filter((p) => p.stock <= 0).length;
    const s = overview.ordersByStatus;
    return [
      { label: "Vendas hoje", value: formatBRL(overview.salesToday), icon: "💰", hint: null as string | null },
      { label: "Vendas no mês", value: formatBRL(overview.salesMonth), icon: "📅", hint: null },
      { label: "Faturamento total", value: formatBRL(overview.salesTotal), icon: "💎", hint: `${overview.conversion.toLocaleString("pt-BR")}% de conversão` },
      { label: "Pedidos pendentes", value: String(s.pending ?? 0), icon: "⏳", hint: null },
      { label: "Pedidos aprovados", value: String(s.approved ?? 0), icon: "✅", hint: null },
      { label: "Pedidos entregues", value: String(s.delivered ?? 0), icon: "📦", hint: null },
      { label: "Cancelados", value: String(s.cancelled ?? 0), icon: "🚫", hint: null },
      { label: "Produtos ativos", value: String(catalogActive), icon: "🛍️", hint: `${overview.products} no total` },
      { label: "Contas em estoque", value: String(overview.accounts.available), icon: "🔑", hint: `${overview.accounts.total} contas` },
      { label: "Sem estoque", value: String(catalogOut), icon: "🈳", hint: null },
      { label: "Usuários cadastrados", value: String(overview.users), icon: "👤", hint: null },
      { label: "Ticket médio", value: formatBRL(overview.averageTicket), icon: "🧾", hint: `${overview.paidOrders} pedidos pagos` },
    ];
  }, [overview, products]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-10"
    >
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          Visão geral em tempo real — o painel se atualiza sozinho a cada 30s.
        </p>
        <Button size="sm" variant="ghost" onClick={() => void loadAll()} disabled={refreshing}>
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="glass rounded-hero p-5 shadow-soft">
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton className="mt-3 h-7 w-28 rounded-full" />
              </div>
            ))
          : kpis.map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.03, ease: "easeOut" }}
              >
                <div className="glass flex h-full flex-col justify-between rounded-hero p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-dim">
                      {k.label}
                    </p>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-secondary/10 text-lg shadow-glow">
                      {k.icon}
                    </span>
                  </div>
                  <p className="mt-3 font-display text-2xl font-extrabold leading-tight text-text">
                    {k.value}
                  </p>
                  {k.hint && <p className="mt-1 text-[11px] font-semibold text-dim">{k.hint}</p>}
                </div>
              </motion.div>
            ))}
      </section>

      {/* Gráfico de vendas */}
      <section className="glass rounded-hero p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <TrendingUp className="size-5 text-primary" />
            Vendas por <span className="text-gradient">período</span>
          </h2>
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95",
                  period === p.id
                    ? "bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow"
                    : "glass text-muted hover:text-text",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6">
          {loading ? (
            <div className="flex h-56 items-end gap-2 px-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className="h-full flex-1 rounded-t-xl" />
              ))}
            </div>
          ) : sales ? (
            <SalesChart data={sales} />
          ) : (
            <div className="grid h-56 place-items-center rounded-2xl bg-white/[0.03] text-center">
              <p className="font-display text-sm font-bold text-dim">Sem dados para exibir.</p>
            </div>
          )}
        </div>
      </section>

      {/* Alertas */}
      {alerts && (alerts.lowStock.length + alerts.outOfStock.length + alerts.lowAccounts.length + alerts.inactive.length) > 0 && (
        <section className="rounded-hero border border-error/20 bg-error/[0.04] p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <span className="grid size-8 place-items-center rounded-xl bg-error/15 text-base">⚠️</span>
            Precisa de <span className="text-gradient">atenção</span>
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {alerts.outOfStock.length > 0 && (
              <AlertCard
                title="Sem estoque"
                count={alerts.outOfStock.length}
                emoji="🈳"
                items={alerts.outOfStock}
                tone="bg-error/15 text-error"
              />
            )}
            {alerts.lowStock.length > 0 && (
              <AlertCard
                title="Estoque baixo"
                count={alerts.lowStock.length}
                emoji="📉"
                items={alerts.lowStock}
                tone="bg-amber-400/15 text-amber-400"
              />
            )}
            {alerts.lowAccounts.length > 0 && (
              <AlertCard
                title="Poucas contas"
                count={alerts.lowAccounts.length}
                emoji="🔑"
                items={alerts.lowAccounts}
                tone="bg-sky-400/15 text-sky-400"
              />
            )}
            {alerts.inactive.length > 0 && (
              <AlertCard
                title="Inativos"
                count={alerts.inactive.length}
                emoji="🌙"
                items={alerts.inactive}
                tone="bg-purple-400/15 text-purple-400"
              />
            )}
          </div>
        </section>
      )}

      {/* Top produtos + Top clientes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-hero p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Package className="size-5 text-primary" />
            Top <span className="text-gradient">produtos</span>
          </h2>
          {topProducts === null ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <p className="mt-6 text-sm text-dim">Sem vendas pagas ainda — os destaques aparecem aqui.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {topProducts.map((p, i) => (
                <RankRow key={p.productId} rank={i + 1}>
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs font-semibold text-dim">{p.quantity}×</span>
                  <span className="text-gradient font-display font-extrabold">
                    {formatBRL(p.revenue)}
                  </span>
                </RankRow>
              ))}
            </ol>
          )}
        </section>

        <section className="glass rounded-hero p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Users className="size-5 text-primary" />
            Top <span className="text-gradient">clientes</span>
          </h2>
          {topCustomers === null ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : topCustomers.length === 0 ? (
            <p className="mt-6 text-sm text-dim">Sem clientes pagantes ainda.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {topCustomers.map((c, i) => (
                <RankRow key={`${c.userId ?? c.name}`} rank={i + 1}>
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs font-semibold text-dim">
                    {c.orders} pedido{c.orders === 1 ? "" : "s"}
                  </span>
                  <span className="text-gradient font-display font-extrabold">
                    {formatBRL(c.revenue)}
                  </span>
                </RankRow>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Últimos pedidos + Atividades recentes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-hero p-5 shadow-soft sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
              <ClipboardCheck className="size-5 text-primary" />
              Últimos <span className="text-gradient">pedidos</span>
            </h2>
            {onGoToOrders && (
              <button
                type="button"
                onClick={onGoToOrders}
                className="flex cursor-pointer items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:bg-white/[0.1] hover:text-text"
              >
                Ver todos
                <ArrowRight className="size-3" />
              </button>
            )}
          </div>
          {recentOrders === null ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-white/[0.03] p-8 text-center">
              <span className="text-4xl">📭</span>
              <p className="font-display text-sm font-bold text-text">Nenhum pedido ainda</p>
              <p className="text-xs text-dim">Os pedidos novos aparecem aqui em tempo real.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentOrders.map((order) => {
                const meta = STATUS_META[order.status] ?? STATUS_META.pending;
                return (
                  <li key={order.id} className="rounded-2xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-extrabold text-text">
                          #{order.id.slice(4).toUpperCase()}
                        </span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", meta.className)}>
                          {meta.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-dim">{orderDate(order.createdAt)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted">{order.customer.name}</span>
                      <span className="shrink-0 font-display font-extrabold text-text">
                        {formatBRL(order.total)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="glass rounded-hero p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <TrendingUp className="size-5 text-primary" />
            Atividades <span className="text-gradient">recentes</span>
          </h2>
          {logs === null ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-2xl" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-white/[0.03] p-8 text-center">
              <span className="text-4xl">🗒️</span>
              <p className="font-display text-sm font-bold text-text">Sem atividades ainda</p>
              <p className="text-xs text-dim">As ações do admin aparecem aqui.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {logs.map((log) => {
                const d = describeLog(log);
                return (
                  <li key={log.id} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/10 text-base shadow-glow">
                      {d.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-relaxed text-text">{d.text}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dim">
                        {log.adminUsername ? `@${log.adminUsername}` : "admin"} · {timeAgo(log.createdAt)}
                        {log.ip && <span className="truncate"> · {log.ip}</span>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </motion.div>
  );
}

/* ---------- linha de ranking (top produtos/clientes) ---------- */

function RankRow({ rank, children }: { rank: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold",
          rank <= 3
            ? "bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow"
            : "bg-white/[0.06] text-dim",
        )}
      >
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm font-semibold text-text">
        {children}
      </div>
    </li>
  );
}

/* ---------- card de alerta (estoque baixo, sem contas, etc.) ---------- */

function AlertCard({
  title,
  count,
  emoji,
  items,
  tone,
}: {
  title: string;
  count: number;
  emoji: string;
  items: { slug: string; name: string; stock?: number; accounts?: number; available?: number }[];
  tone: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-text">
          <span className="text-base">{emoji}</span>
          {title}
        </p>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", tone)}>{count}</span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex w-full cursor-pointer items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
      >
        <span className="truncate text-xs font-semibold text-muted">{items[0].name}</span>
        <span className="text-[10px] font-bold text-dim">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
          {items.map((it) => (
            <li key={it.slug} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
              <span className="truncate text-xs text-muted">{it.name}</span>
              <span className="shrink-0 text-[10px] font-bold text-dim">
                {typeof it.available === "number"
                  ? `${it.available} disponível(is)`
                  : typeof it.accounts === "number"
                    ? `${it.accounts} conta(s)`
                    : `${it.stock ?? 0} em estoque`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- gráfico de barras SVG (sem dependência) ---------- */

const CHART_W = 640;
const CHART_H = 220;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 30;

function SalesChart({ data }: { data: SalesPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((p) => p.revenue)), [data]);
  const hasSales = data.some((p) => p.revenue > 0);

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const step = plotW / data.length;
  const barW = Math.min(28, step * 0.55);

  const ticks = useMemo(
    () => [0, 0.5, 1].map((t) => Math.round(max * t * 100) / 100),
    [max],
  );

  if (!hasSales) {
    return (
      <div className="grid h-56 place-items-center rounded-2xl bg-white/[0.03] text-center">
        <div>
          <p className="text-4xl">📈</p>
          <p className="mt-2 font-display text-sm font-bold text-text">Sem vendas pagas no período</p>
          <p className="mt-1 text-xs text-dim">Assim que as vendas entrarem, o gráfico ganha vida.</p>
        </div>
      </div>
    );
  }

  const labelStep = data.length <= 8 ? 1 : 2;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Gráfico de vendas por período"
      >
        <defs>
          <linearGradient id="salesBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff8a00" />
            <stop offset="100%" stopColor="#ffc83d" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* grade + eixo Y */}
        {ticks.map((t) => {
          const y = PAD_T + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={CHART_W - PAD_R}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 4"
              />
              <text
                x={PAD_L - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="#a1a1aa"
                className="font-mono"
              >
                {compactBRL(t)}
              </text>
            </g>
          );
        })}

        {/* barras */}
        {data.map((p, i) => {
          const h = (p.revenue / max) * plotH;
          const x = PAD_L + i * step + (step - barW) / 2;
          const y = PAD_T + plotH - h;
          const isActive = active === i;
          return (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {/* área de hover (maior que a barra) */}
              <rect x={PAD_L + i * step} y={PAD_T} width={step} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 2)}
                rx={6}
                fill="url(#salesBarGrad)"
                opacity={isActive ? 1 : 0.65}
                style={{ transition: "opacity 0.15s ease" }}
              />
              {isActive && (
                <rect
                  x={x - 3}
                  y={Math.max(y - 2, PAD_T - 2)}
                  width={barW + 6}
                  height={Math.max(h, 2) + 2}
                  rx={8}
                  fill="none"
                  stroke="#ff8a00"
                  strokeOpacity="0.6"
                  strokeWidth="1.5"
                />
              )}
            </g>
          );
        })}

        {/* rótulos X */}
        {data.map((p, i) =>
          i % labelStep === 0 ? (
            <text
              key={i}
              x={PAD_L + i * step + step / 2}
              y={CHART_H - 10}
              textAnchor="middle"
              fontSize="9.5"
              fill="#a1a1aa"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>

      {/* tooltip */}
      {active !== null && data[active] && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-white/10 bg-surface/95 px-3 py-2 shadow-lift backdrop-blur-md"
          style={{
            left: `${((PAD_L + (active + 0.5) * step) / CHART_W) * 100}%`,
          }}
        >
          <p className="font-display text-xs font-extrabold text-text">{data[active].label}</p>
          <p className="text-xs font-bold text-primary">{formatBRL(data[active].revenue)}</p>
          <p className="text-[10px] text-dim">
            {data[active].orders} pedido{data[active].orders === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
