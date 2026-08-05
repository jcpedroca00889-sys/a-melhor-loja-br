import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import {
  api,
  type AdminOrder,
  type BatchStatusResult,
  type OrderEventRow,
  type OrderStatus,
  type PaginatedOrders,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";
import { useCatalogProducts } from "@/lib/store/catalog-store";
import { generateFakeAccount } from "@/lib/fake-account";
import { formatBRL } from "@/lib/format";
import { toast } from "@/lib/store/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ============================================================
   ORDERS TAB (Fase C) — página de pedidos do painel admin.
   Pesquisa + filtros (status/modo de entrega) + paginação no
   servidor, fila de entrega manual, ações por status, modal de
   detalhes com timeline, ações em lote, comprovante .txt.
   ============================================================ */

const PAGE_SIZE = 8;

type StatusFilter = "all" | OrderStatus | "refunded";
type DeliveryFilter = "all" | "auto" | "adm" | "manual";
type DisplayStatus = OrderStatus | "refunded";

const STATUS_META: Record<DisplayStatus, { label: string; className: string }> = {
  pending: { label: "Aguardando", className: "bg-amber-400/15 text-amber-400" },
  approved: { label: "Aprovado", className: "bg-sky-400/15 text-sky-400" },
  delivered: { label: "Entregue", className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelado", className: "bg-error/15 text-error" },
  refunded: { label: "Reembolsado", className: "bg-purple-400/15 text-purple-400" },
};

const PAYMENT_META: Record<string, { label: string; className: string }> = {
  mercadopago: { label: "Mercado Pago", className: "bg-sky-400/15 text-sky-400" },
  simulation: { label: "PIX simulado", className: "bg-primary/15 text-primary" },
  none: { label: "Sem pagamento", className: "bg-white/[0.08] text-dim" },
};

const DELIVERY_MODE_META: Record<string, { label: string; className: string }> = {
  auto: { label: "Auto", className: "bg-success/15 text-success" },
  adm: { label: "Admin", className: "bg-sky-400/15 text-sky-400" },
  manual: { label: "Manual", className: "bg-amber-400/15 text-amber-400" },
};

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendentes" },
  { id: "approved", label: "Pagos / Em entrega" },
  { id: "delivered", label: "Entregues" },
  { id: "cancelled", label: "Cancelados" },
  { id: "refunded", label: "Reembolsados" },
];

const DELIVERY_FILTERS: { id: DeliveryFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "auto", label: "Auto" },
  { id: "adm", label: "Admin" },
  { id: "manual", label: "Manual" },
];

const shortId = (id: string) => `#${id.slice(4).toUpperCase()}`;

/** Reembolsados é um payment_status (não um status do pedido). */
const displayStatus = (o: AdminOrder): DisplayStatus =>
  o.paymentStatus === "refunded" || o.paymentStatus === "charged_back" ? "refunded" : o.status;

const pillClasses = (active: boolean) =>
  cn(
    "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95",
    active
      ? "bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow"
      : "glass text-muted hover:text-text",
  );

function humanizeEvent(ev: OrderEventRow): { emoji: string; title: string } {
  switch (ev.event) {
    case "created":
      return { emoji: "🛒", title: "Pedido criado" };
    case "payment_created":
      return { emoji: "🧾", title: "PIX gerado" };
    case "payment_approved":
      return { emoji: "💳", title: "Pagamento aprovado" };
    case "payment_rejected":
      return { emoji: "🚫", title: "Pagamento rejeitado" };
    case "expired":
      return { emoji: "⏰", title: "PIX expirado" };
    case "needs_manual":
      return { emoji: "🔔", title: "Entrega manual necessária" };
    case "delivery_started":
      return { emoji: "📤", title: "Entrega iniciada" };
    case "delivered":
      return { emoji: "📦", title: "Entregue ao cliente" };
    case "cancelled":
      return { emoji: "🗑️", title: "Pedido cancelado" };
    case "refunded":
      return { emoji: "💸", title: "Reembolsado" };
    default:
      return { emoji: "📝", title: ev.event };
  }
}

/* ---------- componente principal ---------- */

export default function OrdersTab({ onOrdersChanged }: { onOrdersChanged?: () => void }) {
  const products = useCatalogProducts();
  const productMap = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);

  const resolveItem = useCallback(
    (item: { productId?: string; qty?: number; name?: string; price?: number }) => {
      const p = productMap.get(item.productId ?? "");
      const qty = Math.max(1, Math.floor(Number(item.qty)) || 1);
      return {
        name: item.name ?? p?.name ?? item.productId ?? "Item",
        price: typeof item.price === "number" ? item.price : (p?.price ?? 0),
        emoji: p?.emoji ?? null,
        qty,
      };
    },
    [productMap],
  );

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryFilter>("all");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [queue, setQueue] = useState<AdminOrder[] | null>(null);
  const [detailOrder, setDetailOrder] = useState<AdminOrder | null>(null);
  const [events, setEvents] = useState<OrderEventRow[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [refundFor, setRefundFor] = useState<AdminOrder | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [redelivering, setRedelivering] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      if (!silent) setLoading(true);
      setRefreshing(silent);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));
        params.set("sort", sort);
        if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
        if (status === "refunded") {
          params.set("status", "cancelled");
          params.set("paymentStatus", "refunded");
        } else if (status !== "all") params.set("status", status);
        if (deliveryMode !== "all") params.set("deliveryMode", deliveryMode);
        const data = await api<PaginatedOrders>(`/admin/orders?${params.toString()}`, { token });
        setOrders(data.orders);
        setTotal(data.total);
      } catch (e) {
        if (!silent) {
          toast({
            title: "Não foi possível carregar os pedidos",
            description: e instanceof Error ? e.message : "Tente novamente.",
            variant: "error",
          });
        }
        setOrders((prev) => prev ?? []);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, debouncedQ, status, deliveryMode, sort],
  );

  const loadQueue = useCallback(async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      // needsManual=1 é filtro real do backend; limit generoso para não truncar
      // a fila silenciosamente (sem paginação invisível).
      const data = await api<PaginatedOrders>(
        `/admin/orders?status=approved&needsManual=1&page=1&limit=100&sort=desc`,
        { token },
      );
      setQueue(data.orders);
    } catch {
      setQueue([]);
    }
  }, []);

  const loadEvents = useCallback(async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setEventsLoading(true);
    try {
      const res = await api<{ events: OrderEventRow[] }>(`/admin/orders/${id}/events`, { token });
      setEvents(res.events);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  /* pesquisa com debounce */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  /* fetch sempre que filtros/página mudam */
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  /* auto-refresh leve a cada 30s (preserva filtros) */
  useEffect(() => {
    const t = setInterval(() => {
      void load(true);
      void loadQueue();
    }, 30_000);
    return () => clearInterval(t);
  }, [load, loadQueue]);

  /* trocar filtro/página limpa a seleção */
  useEffect(() => {
    setSelected(new Set());
  }, [debouncedQ, status, deliveryMode, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* ---------- ações ---------- */

  const changeStatus = async (order: AdminOrder, newStatus: OrderStatus, delivery?: { message: string }) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setBusy(order.id);
    try {
      const res = await api<{ order: AdminOrder }>(`/admin/orders/${order.id}/status`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status: newStatus, delivery }),
      });
      setDelivering(null);
      setDraft("");
      toast({
        title:
          newStatus === "approved"
            ? "Pagamento aprovado ✅"
            : newStatus === "delivered"
              ? "Produto entregue 🎁"
              : "Pedido cancelado",
        variant: "success",
      });
      setDetailOrder((prev) => (prev?.id === res.order.id ? res.order : prev));
      onOrdersChanged?.();
      void load(true);
      void loadQueue();
    } catch (e) {
      toast({
        title: "Não foi possível atualizar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const simulatePayment = async (order: AdminOrder, outcome: "approved" | "rejected" | "expired" = "approved") => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setBusy(order.id);
    try {
      await api(`/admin/simulate-payment`, {
        method: "POST",
        token,
        body: JSON.stringify({ orderId: order.id, outcome }),
      });
      toast({
        title: "Pagamento simulado",
        description: outcome === "approved" ? "Aprovado — pedido processado ✅" : "Pagamento recusado",
        variant: "success",
      });
      onOrdersChanged?.();
      void load(true);
      void loadQueue();
    } catch (e) {
      toast({
        title: "Não foi possível simular",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const refundOrder = async (order: AdminOrder) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setBusy(order.id);
    try {
      await api(`/admin/orders/${order.id}/refund`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: refundReason.trim() || undefined }),
      });
      toast({
        title: "Reembolso registrado 💸",
        description: refundReason.trim() || "Sem motivo informado.",
        variant: "success",
      });
      setRefundFor(null);
      setRefundReason("");
      onOrdersChanged?.();
      void load(true);
      void loadQueue();
    } catch (e) {
      toast({
        title: "Não foi possível reembolsar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const redeliverOrder = async (order: AdminOrder) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setRedelivering(order.id);
    try {
      await api(`/admin/orders/${order.id}/redeliver`, {
        method: "POST",
        token,
        body: JSON.stringify({ message: order.delivery?.message ?? undefined }),
      });
      toast({ title: "Entrega reenviada 🔁", variant: "success" });
      void load(true);
    } catch (e) {
      toast({
        title: "Não foi possível reenviar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setRedelivering(null);
    }
  };

  const batchAction = async (newStatus: "approved" | "cancelled") => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const targets = (orders ?? []).filter((o) => selected.has(o.id));
    if (targets.length === 0) return;
    setBatchBusy(true);
    try {
      const res = await api<BatchStatusResult>(`/admin/orders/batch-status`, {
        method: "POST",
        token,
        body: JSON.stringify({ ids: targets.map((o) => o.id), status: newStatus }),
      });
      const verb = newStatus === "approved" ? "aprovado(s)" : "cancelado(s)";
      toast({
        title: "Ação em lote concluída",
        description: `${res.applied} ${verb}${res.skipped.length > 0 ? ` · ${res.skipped.length} pulado(s)` : ""}.`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Falha na ação em lote",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setBatchBusy(false);
      setSelected(new Set());
      onOrdersChanged?.();
      void load(true);
      void loadQueue();
    }
  };

  const openDetail = (order: AdminOrder) => {
    setDetailOrder(order);
    setEvents(null);
    void loadEvents(order.id);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado! 📋", variant: "success" });
    } catch {
      /* clipboard indisponível */
    }
  };

  const copyDelivery = (order: AdminOrder) => {
    if (!order.delivery?.message) return;
    void copyText(order.delivery.message);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fillFakeAccount = (order: AdminOrder) => {
    const first = order.items[0];
    const name = typeof first?.name === "string" ? first.name : resolveItem(first).name;
    setDraft(generateFakeAccount(name, order.customer.name).message);
  };

  const downloadReceipt = (order: AdminOrder) => {
    const payMeta = PAYMENT_META[order.paymentProvider ?? "none"] ?? PAYMENT_META.none;
    const lines: string[] = [
      "==========================================",
      "      SATOSHII STORE — COMPROVANTE",
      "==========================================",
      `Pedido:      ${order.id}`,
      `Data:        ${new Date(order.createdAt).toLocaleString("pt-BR")}`,
      "",
      "CLIENTE",
      `Nome:        ${order.customer.name}`,
      `E-mail:      ${order.customer.email || "-"}`,
      `WhatsApp:    ${order.customer.phone || "-"}`,
      `Conta:       ${order.user ? "@" + order.user.username : "sem conta"}`,
      "",
      "PAGAMENTO",
      `Provedor:    ${payMeta.label}`,
      `Status:      ${order.paymentStatus ?? "-"}`,
      `ID:          ${order.paymentId ?? "-"}`,
      "",
      "ITENS",
    ];
    for (const item of order.items) {
      const r = resolveItem(item);
      lines.push(`  ${r.qty}× ${r.name}  —  ${formatBRL(r.price * r.qty)}`);
    }
    lines.push("");
    lines.push(`Subtotal:    ${formatBRL(order.subtotal)}`);
    if (order.couponCode) lines.push(`Cupom ${order.couponCode}: -${formatBRL(order.discountAmount)}`);
    lines.push(`Total:       ${formatBRL(order.total)}`);
    if (order.delivery?.message) {
      lines.push("", "CONTEÚDO DA ENTREGA", order.delivery.message);
    }
    lines.push("", "==========================================");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprovante-${order.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Comprovante baixado 📄", variant: "success" });
  };

  /* ---------- render ---------- */

  return (
    <div className="space-y-6">
      {/* FILA — ENTREGA MANUAL */}
      {queue !== null && queue.length > 0 && (
        <section className="rounded-hero border border-secondary/25 bg-gradient-to-br from-secondary/10 to-primary/5 p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
              ⚠️ Fila <span className="text-gradient">entrega manual</span>
              <span className="rounded-full bg-secondary/20 px-2.5 py-0.5 text-xs font-extrabold text-secondary">
                {queue.length}
              </span>
            </h3>
            <p className="text-xs text-dim">Pedidos aprovados aguardando entrega pelo admin.</p>
          </div>
          <ul className="mt-4 space-y-3">
            {queue.map((order) => {
              const meta = STATUS_META[displayStatus(order)];
              return (
                <li key={order.id} className="rounded-2xl bg-background/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-extrabold text-text">
                        {shortId(order.id)}
                      </span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", meta.className)}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-dim">{order.customer.name}</span>
                    </div>
                    <span className="font-display text-sm font-extrabold text-text">
                      {formatBRL(order.total)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy === order.id}
                      onClick={() => {
                        setDelivering(delivering === order.id ? null : order.id);
                        setDraft(order.delivery?.message ?? "");
                      }}
                    >
                      <Package className="size-4" />
                      Entregar produto
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openDetail(order)}>
                      <Eye className="size-4" />
                      Detalhes
                    </Button>
                  </div>
                  {delivering === order.id && (
                    <DeliveryForm
                      draft={draft}
                      onDraft={setDraft}
                      onFill={() => fillFakeAccount(order)}
                      onConfirm={() => changeStatus(order, "delivered", { message: draft.trim() })}
                      onClose={() => setDelivering(null)}
                      busy={busy === order.id}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* TOOLBAR */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nome, e-mail, ID, produto…"
              className="pl-9"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSort((s) => (s === "desc" ? "asc" : "desc"));
                setPage(1);
              }}
            >
              {sort === "desc" ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
              {sort === "desc" ? "Mais recentes" : "Mais antigos"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={refreshing}>
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* filtros de status */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setStatus(f.id);
                setPage(1);
              }}
              className={pillClasses(status === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* filtro por modo de entrega */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-dim">Entrega:</span>
          {DELIVERY_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setDeliveryMode(f.id);
                setPage(1);
              }}
              className={pillClasses(deliveryMode === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* BARRA DE LOTE */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 rounded-hero border border-primary/25 bg-primary/10 p-4 shadow-glow"
        >
          <span className="text-sm font-bold text-text">{selected.size} selecionado(s)</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" disabled={batchBusy} onClick={() => void batchAction("approved")}>
              <CheckCircle2 className="size-4" />
              Aprovar
            </Button>
            <Button size="sm" variant="destructive" disabled={batchBusy} onClick={() => void batchAction("cancelled")}>
              <XCircle className="size-4" />
              Cancelar
            </Button>
            <Button size="sm" variant="ghost" disabled={batchBusy} onClick={() => setSelected(new Set())}>
              <X className="size-4" />
              Limpar
            </Button>
          </div>
        </motion.div>
      )}

      {/* LISTA */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass rounded-hero p-5 shadow-soft">
              <Skeleton className="h-4 w-1/3 rounded-full" />
              <Skeleton className="mt-3 h-3 w-1/2 rounded-full" />
              <Skeleton className="mt-2 h-3 w-2/3 rounded-full" />
            </div>
          ))}
        </div>
      ) : orders === null || orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-hero bg-white/[0.03] p-10 text-center">
          <span className="text-5xl">{q.trim() ? "🔍" : status === "refunded" ? "💸" : "📭"}</span>
          <p className="font-display font-bold">{q.trim() ? "Nada encontrado" : "Nenhum pedido aqui"}</p>
          <p className="max-w-xs text-sm text-dim">
            {q.trim()
              ? "Tente buscar por outro termo."
              : "Quando os clientes comprarem, os pedidos aparecem para aprovação."}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              selected={selected.has(order.id)}
              onToggleSelect={() => toggleSelect(order.id)}
              busy={busy === order.id}
              delivering={delivering === order.id}
              draft={draft}
              onDraft={setDraft}
              onOpenDeliver={() => {
                setDelivering(delivering === order.id ? null : order.id);
                setDraft(order.delivery?.message ?? "");
              }}
              onCloseDeliver={() => setDelivering(null)}
              onFillFake={() => fillFakeAccount(order)}
              onConfirmDeliver={() => changeStatus(order, "delivered", { message: draft.trim() })}
              onApprove={() => changeStatus(order, "approved")}
              onCancel={() => changeStatus(order, "cancelled")}
              onSimulate={() => void simulatePayment(order, "approved")}
              onRefund={() => {
                setRefundFor(order);
                setRefundReason("");
              }}
              onRedeliver={() => void redeliverOrder(order)}
              redelivering={redelivering === order.id}
              onCopyDelivery={() => copyDelivery(order)}
              onDownload={() => downloadReceipt(order)}
              onDetail={() => openDetail(order)}
              resolve={resolveItem}
            />
          ))}
        </ul>
      )}

      {/* PAGINAÇÃO */}
      {!loading && orders !== null && (
        <div className="flex items-center justify-between gap-3">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ArrowLeft className="size-4" />
            Anterior
          </Button>
          <span className="text-xs font-semibold text-dim">
            Página {page} de {pages} · {total} pedido(s)
          </span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      {/* MODAL — DETALHES */}
      <AnimatePresence>
        {detailOrder && (
          <OrderDetailModal
            order={detailOrder}
            events={events}
            eventsLoading={eventsLoading}
            busy={busy === detailOrder.id}
            resolve={resolveItem}
            onClose={() => setDetailOrder(null)}
            onApprove={() => changeStatus(detailOrder, "approved")}
            onCancel={() => changeStatus(detailOrder, "cancelled")}
            onRefund={() => {
              setRefundFor(detailOrder);
              setRefundReason("");
            }}
            onCopyPaymentId={() => void copyText(detailOrder.paymentId ?? "")}
            onCopyDelivery={() => copyDelivery(detailOrder)}
            onDownload={() => downloadReceipt(detailOrder)}
          />
        )}
      </AnimatePresence>

      {/* MODAL — REEMBOLSO */}
      <AnimatePresence>
        {refundFor && (
          <RefundModal
            order={refundFor}
            reason={refundReason}
            onReason={setRefundReason}
            busy={busy === refundFor.id}
            onClose={() => setRefundFor(null)}
            onConfirm={() => void refundOrder(refundFor)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- card de pedido ---------- */

interface OrderCardProps {
  order: AdminOrder;
  selected: boolean;
  onToggleSelect: () => void;
  busy: boolean;
  delivering: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onOpenDeliver: () => void;
  onCloseDeliver: () => void;
  onFillFake: () => void;
  onConfirmDeliver: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onSimulate: () => void;
  onRefund: () => void;
  onRedeliver: () => void;
  redelivering: boolean;
  onCopyDelivery: () => void;
  onDownload: () => void;
  onDetail: () => void;
  resolve: (item: { productId?: string; qty?: number; name?: string; price?: number }) => {
    name: string;
    price: number;
    emoji: string | null;
    qty: number;
  };
}

function OrderCard({
  order,
  selected,
  onToggleSelect,
  busy,
  delivering,
  draft,
  onDraft,
  onOpenDeliver,
  onCloseDeliver,
  onFillFake,
  onConfirmDeliver,
  onApprove,
  onCancel,
  onSimulate,
  onRefund,
  onRedeliver,
  redelivering,
  onCopyDelivery,
  onDownload,
  onDetail,
  resolve,
}: OrderCardProps) {
  const meta = STATUS_META[displayStatus(order)];
  const payMeta = PAYMENT_META[order.paymentProvider ?? "none"] ?? PAYMENT_META.none;
  const modeMeta = order.deliveryMode ? DELIVERY_MODE_META[order.deliveryMode] : null;

  return (
    <li className="glass rounded-hero p-5 shadow-soft transition-colors hover:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="size-4 shrink-0 cursor-pointer accent-primary"
          aria-label="Selecionar pedido"
        />
        <span className="font-display text-sm font-extrabold">{shortId(order.id)}</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", meta.className)}>
          {meta.label}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", payMeta.className)}>
            {payMeta.label}
          </span>
          {modeMeta && (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", modeMeta.className)}>
              {modeMeta.label}
            </span>
          )}
          {order.needsManual && (
            <span className="rounded-full bg-secondary/15 px-2.5 py-0.5 text-[11px] font-bold text-secondary">
              Manual necessária
            </span>
          )}
          {order.couponCode && (
            <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-bold text-success">
              Cupom {order.couponCode}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 text-sm lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-dim">Cliente</p>
          <p className="font-semibold text-text">{order.customer.name}</p>
          <p className="flex items-center gap-1 text-muted">
            <MessageCircle className="size-3 text-success" />
            {order.customer.phone || "sem WhatsApp"}
          </p>
          {order.customer.email && <p className="truncate text-muted">{order.customer.email}</p>}
          {order.user ? (
            <p className="text-xs text-dim">conta: @{order.user.username}</p>
          ) : (
            <p className="text-xs text-dim">sem conta vinculada</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-dim">Itens</p>
          <ul className="mt-1 space-y-1">
            {order.items.map((item, i) => {
              const r = resolve(item);
              return (
                <li key={i} className="flex items-center gap-2">
                  {r.emoji && <span>{r.emoji}</span>}
                  <span className="truncate text-muted">
                    {r.qty}× {r.name}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-dim">
            Criado em {new Date(order.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/[0.04] p-3 text-sm">
        <span className="text-dim">
          Subtotal {formatBRL(order.subtotal)}
          {order.couponCode ? ` · cupom -${formatBRL(order.discountAmount)}` : ""}
        </span>
        <span className="font-display text-base font-extrabold text-text">{formatBRL(order.total)}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        {order.status === "pending" && (
          <>
            {order.paymentStatus === "pending" && (
              <Button size="sm" disabled={busy} onClick={onApprove}>
                <CheckCircle2 className="size-4" />
                Aprovar pagamento
              </Button>
            )}
            {order.paymentProvider !== "mercadopago" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onSimulate}
                title="Modo simulação — aprova o pagamento do pedido"
              >
                <CheckCircle2 className="size-4" />
                Simular pagamento
              </Button>
            )}
            <Button size="sm" variant="destructive" disabled={busy} onClick={onCancel}>
              <XCircle className="size-4" />
              Cancelar
            </Button>
          </>
        )}

        {order.status === "approved" && (
          <>
            <Button size="sm" disabled={busy} onClick={onOpenDeliver}>
              <Package className="size-4" />
              Entregar produto
            </Button>
            <Button size="sm" variant="secondary" disabled={redelivering} onClick={onRedeliver}>
              <RefreshCw className="size-4" />
              Reenviar
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onRefund}>
              <Trash2 className="size-4" />
              Reembolsar
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={onCancel}>
              <XCircle className="size-4" />
              Cancelar
            </Button>
          </>
        )}

        {order.status === "delivered" && (
          <>
            {order.delivery && (
              <Button size="sm" variant="secondary" onClick={onCopyDelivery}>
                <Copy className="size-4" />
                Copiar entrega
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={redelivering} onClick={onRedeliver}>
              <RefreshCw className="size-4" />
              Reenviar
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onRefund}>
              <Trash2 className="size-4" />
              Reembolsar
            </Button>
            <Button size="sm" variant="ghost" onClick={onDownload}>
              <Download className="size-4" />
              Comprovante
            </Button>
          </>
        )}

        {order.status === "cancelled" && (
          <Button size="sm" variant="ghost" onClick={onDownload}>
            <Download className="size-4" />
            Comprovante
          </Button>
        )}

        <Button size="sm" variant="ghost" className="ml-auto" onClick={onDetail}>
          <Eye className="size-4" />
          Detalhes
        </Button>
      </div>

      {delivering && (
        <DeliveryForm
          draft={draft}
          onDraft={onDraft}
          onFill={onFillFake}
          onConfirm={onConfirmDeliver}
          onClose={onCloseDeliver}
          busy={busy}
        />
      )}
    </li>
  );
}

/* ---------- formulário de entrega ---------- */

function DeliveryForm({
  draft,
  onDraft,
  onFill,
  onConfirm,
  onClose,
  busy,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onFill: () => void;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-background/40 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-dim">Contas e acessos</span>
        <Button size="sm" variant="outline" onClick={onFill}>
          <Wand2 className="size-3.5" />
          Gerar conta fake
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        rows={4}
        placeholder={"Cole aqui as contas e acessos do produto, ex:\nlogin: cliente@email.com\nsenha: 123456\ncódigo de ativação: ABCD-1234"}
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={busy || draft.trim().length === 0} onClick={onConfirm}>
          <CheckCircle2 className="size-4" />
          Confirmar entrega
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="size-4" />
          Fechar
        </Button>
      </div>
    </div>
  );
}

/* ---------- modal de detalhes ---------- */

function OrderDetailModal({
  order,
  events,
  eventsLoading,
  busy,
  resolve,
  onClose,
  onApprove,
  onCancel,
  onRefund,
  onCopyPaymentId,
  onCopyDelivery,
  onDownload,
}: {
  order: AdminOrder;
  events: OrderEventRow[] | null;
  eventsLoading: boolean;
  busy: boolean;
  resolve: (item: { productId?: string; qty?: number; name?: string; price?: number }) => {
    name: string;
    price: number;
    emoji: string | null;
    qty: number;
  };
  onClose: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onRefund: () => void;
  onCopyPaymentId: () => void;
  onCopyDelivery: () => void;
  onDownload: () => void;
}) {
  const meta = STATUS_META[displayStatus(order)];
  const payMeta = PAYMENT_META[order.paymentProvider ?? "none"] ?? PAYMENT_META.none;
  const modeMeta = order.deliveryMode ? DELIVERY_MODE_META[order.deliveryMode] : null;
  const ship = order.shipping;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="glass-strong my-8 w-full max-w-3xl rounded-hero p-6 shadow-lift sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-extrabold">{shortId(order.id)}</h3>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", meta.className)}>
              {meta.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="grid size-9 cursor-pointer place-items-center rounded-xl glass text-dim transition-all hover:rotate-90 hover:text-text"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-dim">Cliente</p>
            <p className="mt-1 font-semibold text-text">{order.customer.name}</p>
            <p className="text-sm text-muted">{order.customer.phone || "sem WhatsApp"}</p>
            {order.customer.email && <p className="text-sm text-muted">{order.customer.email}</p>}
            {order.user && <p className="text-xs text-dim">conta: @{order.user.username}</p>}
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-dim">Pagamento</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", payMeta.className)}>
                {payMeta.label}
              </span>
              <span className="text-sm text-muted">{order.paymentStatus ?? "-"}</span>
            </div>
            {order.paymentId && (
              <button
                type="button"
                onClick={onCopyPaymentId}
                className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
              >
                <Copy className="size-3" />
                {order.paymentId}
              </button>
            )}
            {order.expiresAt && (
              <p className="mt-1 text-[11px] text-dim">
                Expira: {new Date(order.expiresAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-dim">Entrega</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {modeMeta && (
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", modeMeta.className)}>
                  {modeMeta.label}
                </span>
              )}
              {order.needsManual && (
                <span className="rounded-full bg-secondary/15 px-2.5 py-0.5 text-[11px] font-bold text-secondary">
                  Entrega manual
                </span>
              )}
            </div>
            {order.delivery?.message ? (
              <>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-success">Conteúdo</p>
                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-background/60 p-3 font-mono text-xs leading-relaxed text-text">
                  {order.delivery.message}
                </pre>
                <button
                  type="button"
                  onClick={onCopyDelivery}
                  className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                >
                  <Copy className="size-3" />
                  Copiar entrega
                </button>
              </>
            ) : (
              <p className="mt-1 text-sm text-dim">Sem conteúdo de entrega.</p>
            )}
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-dim">Endereço</p>
            <p className="mt-1 text-sm text-muted">
              {[ship.street, ship.number, ship.complement, ship.city, ship.state, ship.cep]
                .filter(Boolean)
                .join(", ") || "Entrega online (contas por e-mail)"}
            </p>
          </div>
        </div>

        {/* itens */}
        <div className="mt-4 rounded-2xl bg-white/[0.04] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-dim">Itens</p>
          <ul className="mt-2 space-y-2">
            {order.items.map((item, i) => {
              const r = resolve(item);
              return (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    {r.emoji && <span>{r.emoji}</span>}
                    <span className="text-text">
                      {r.qty}× {r.name}
                    </span>
                  </span>
                  <span className="font-semibold text-text">{formatBRL(r.price * r.qty)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between text-dim">
              <span>Subtotal</span>
              <span className="font-semibold text-text">{formatBRL(order.subtotal)}</span>
            </div>
            {order.couponCode && (
              <div className="flex justify-between text-dim">
                <span>Cupom {order.couponCode}</span>
                <span className="font-semibold text-success">-{formatBRL(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 font-display text-base font-extrabold text-text">
              <span>Total</span>
              <span className="text-gradient">{formatBRL(order.total)}</span>
            </div>
          </div>
        </div>

        {/* timeline */}
        <div className="mt-5">
          <h4 className="font-display text-base font-extrabold">🕒 Linha do tempo</h4>
          {eventsLoading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-xl" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <ol className="mt-4">
              {events.map((ev, i) => {
                const h = humanizeEvent(ev);
                return (
                  <li key={ev.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < events.length - 1 && (
                      <span className="absolute left-[11px] top-6 h-full w-px bg-white/10" />
                    )}
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06] text-xs shadow-soft">
                      {h.emoji}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-text">{h.title}</p>
                      <p className="text-[11px] text-dim">
                        {new Date(ev.createdAt).toLocaleString("pt-BR")} · {ev.actorType}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-dim">Sem eventos registrados.</p>
          )}
        </div>

        {/* ações */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          {order.status === "pending" && (
            <>
              {order.paymentStatus === "pending" && (
                <Button size="sm" disabled={busy} onClick={onApprove}>
                  <CheckCircle2 className="size-4" />
                  Aprovar pagamento
                </Button>
              )}
              <Button size="sm" variant="destructive" disabled={busy} onClick={onCancel}>
                <XCircle className="size-4" />
                Cancelar
              </Button>
            </>
          )}
          {order.status === "approved" && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={onRefund}>
                <Trash2 className="size-4" />
                Reembolsar
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={onCancel}>
                <XCircle className="size-4" />
                Cancelar
              </Button>
            </>
          )}
          {order.status === "delivered" && (
            <Button size="sm" variant="outline" onClick={onRefund}>
              <Trash2 className="size-4" />
              Reembolsar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onDownload}>
            <Download className="size-4" />
            Baixar comprovante
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- modal de reembolso ---------- */

function RefundModal({
  order,
  reason,
  onReason,
  busy,
  onClose,
  onConfirm,
}: {
  order: AdminOrder;
  reason: string;
  onReason: (v: string) => void;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[85] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="glass-strong w-full max-w-md rounded-hero p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-extrabold">
          Reembolsar pedido <span className="text-gradient">{shortId(order.id)}</span>
        </h3>
        <p className="mt-1 text-sm text-muted">
          O pagamento será estornado e o estoque/contas devolvidos. Ação não pode ser desfeita.
        </p>
        <Textarea
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          rows={3}
          placeholder="Motivo do reembolso (opcional)"
          className="mt-4"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            <Trash2 className="size-4" />
            Confirmar reembolso
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
