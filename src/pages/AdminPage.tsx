import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api, type PaginatedOrders } from "@/lib/api";
import { useAuthStore, useUser } from "@/lib/store/auth-store";
import {
  CATALOG_ICON_KEYS,
  useCatalogCategories,
  useCatalogProducts,
  useCatalogStore,
} from "@/lib/store/catalog-store";
import { toast } from "@/lib/store/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/feedback/PageSkeleton";
import DashboardTab from "@/pages/admin/DashboardTab";
import OrdersTab from "@/pages/admin/OrdersTab";
import CustomersTab from "@/pages/admin/CustomersTab";
import CouponsTab from "@/pages/admin/CouponsTab";
import ProductsTab from "@/pages/admin/ProductsTab";
import { cn } from "@/lib/utils";

/* ============================================================
   ADMIN PAGE — painel do administrador.
   Pedidos: aprovar pagamento (fake) e entregar produto (contas).
   Clientes: banir/desbanir, reset de senha, histórico.
   Cupons: CRUD de descontos.
   Catálogo: CRUD de produtos e categorias (persistido no servidor).
   ============================================================ */

type Tab = "dashboard" | "pedidos" | "clientes" | "cupons" | "produtos" | "categorias";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminPage() {
  const restoring = useAuthStore((s) => s.restoring);
  const user = useUser();
  const navigate = useNavigate();

  // Enquanto a sessão persistida é validada, segura o skeleton — se o restore
  // falhar com token inválido, a sessão é limpa e o Navigate abaixo leva pro
  // login. Antes, `token && !user` ficava em skeleton infinito quando o
  // restore terminava com token inválido.
  if (restoring) return <PageSkeleton />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (user.role !== "admin") {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <motion.span
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-6xl"
        >
          🚫
        </motion.span>
        <h1 className="text-3xl font-extrabold">
          Sem <span className="text-gradient">permissão</span>
        </h1>
        <p className="max-w-sm text-muted">
          Esta área é restrita ao administrador da loja.
        </p>
        <Button size="xl" onClick={() => navigate("/")}>
          Voltar à loja
        </Button>
      </section>
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [pendingCount, setPendingCount] = useState(0);
  // Tabs já visitadas ficam montadas (hidden) — preserva estado (filtros/página)
  // ao trocar de aba sem refatorar os componentes.
  const [visited, setVisited] = useState<Set<Tab>>(new Set(["dashboard"]));
  const products = useCatalogProducts();
  const categories = useCatalogCategories();

  const loadOrders = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      // Só precisa do contador de pendentes: busca 1 linha e usa o total real.
      const data = await api<PaginatedOrders>("/admin/orders?status=pending&page=1&limit=1", { token });
      setPendingCount(data.total);
    } catch (e) {
      toast({
        title: "Não foi possível carregar os pedidos",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
      setPendingCount(0);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const showTab = (id: Tab) => {
    setTab(id);
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const tabs: { id: Tab; label: string; icon: typeof ClipboardCheck; count?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "pedidos", label: "Pedidos", icon: ClipboardCheck, count: pendingCount },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "cupons", label: "Cupons", icon: Tag },
    { id: "produtos", label: "Produtos", icon: Package, count: products.length },
    { id: "categorias", label: "Categorias", icon: LayoutGrid, count: categories.length },
  ];

  return (
    <div className="wrap py-16 sm:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-secondary">
            Painel do administrador
          </p>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
            Gerenciar <span className="text-gradient">loja</span>
          </h1>
        </div>
        <Button variant="secondary" onClick={() => navigate("/")}>
          Ver loja
        </Button>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => showTab(t.id)}
            className={cn(
              "flex items-center gap-2 rounded-full border-2 px-4 py-2 font-display text-sm font-bold transition-all duration-300 active:scale-95",
              tab === t.id
                ? "btn-shine border-transparent bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow"
                : "glass border-transparent text-muted hover:text-text",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-extrabold",
                  tab === t.id ? "bg-black/15 text-[#1a0f00]" : "bg-white/[0.08] text-secondary",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {visited.has("dashboard") && (
          <div className={tab === "dashboard" ? "" : "hidden"}>
            <DashboardTab onGoToOrders={() => showTab("pedidos")} />
          </div>
        )}
        {visited.has("pedidos") && (
          <div className={tab === "pedidos" ? "" : "hidden"}>
            <OrdersTab onOrdersChanged={loadOrders} />
          </div>
        )}
        {visited.has("clientes") && (
          <div className={tab === "clientes" ? "" : "hidden"}>
            <CustomersTab />
          </div>
        )}
        {visited.has("cupons") && (
          <div className={tab === "cupons" ? "" : "hidden"}>
            <CouponsTab />
          </div>
        )}
        {visited.has("produtos") && (
          <div className={tab === "produtos" ? "" : "hidden"}>
            <ProductsTab />
          </div>
        )}
        {visited.has("categorias") && (
          <div className={tab === "categorias" ? "" : "hidden"}>
            <CategoriesTab />
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CATEGORIAS — CRUD com ícone lucide
   ============================================================ */

interface CategoryDraft {
  id: string;
  name: string;
  emoji: string;
  color: string;
  gradient: string;
  blurb: string;
  iconKey: string;
}

const EMPTY_CATEGORY: CategoryDraft = {
  id: "",
  name: "",
  emoji: "✨",
  color: "#F97316",
  gradient: "from-orange-500/25 to-amber-500/10",
  blurb: "",
  iconKey: "Puzzle",
};

function CategoriesTab() {
  const categories = useCatalogCategories();
  const refresh = useCatalogStore((s) => s.refresh);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY_CATEGORY);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setDraft({ ...EMPTY_CATEGORY });
    setEditing("new");
  };

  const openEdit = (id: string) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return;
    setDraft({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      gradient: c.gradient,
      blurb: c.blurb,
      iconKey: c.icon.name,
    });
    setEditing(id);
  };

  const save = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setSaving(true);
    const payload = {
      name: draft.name,
      emoji: draft.emoji,
      color: draft.color,
      gradient: draft.gradient,
      blurb: draft.blurb,
      iconKey: draft.iconKey,
    };
    try {
      if (editing === "new") {
        await api("/categories", {
          method: "POST",
          token,
          body: JSON.stringify({ ...payload, id: draft.id }),
        });
        toast({ title: "Categoria criada! 🎉", variant: "success" });
      } else if (editing) {
        await api(`/categories/${editing}`, { method: "PATCH", token, body: JSON.stringify(payload) });
        toast({ title: "Categoria atualizada ✨", variant: "success" });
      }
      setEditing(null);
      await refresh();
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!window.confirm("Excluir esta categoria?")) return;
    try {
      await api(`/categories/${id}`, { method: "DELETE", token });
      toast({ title: "Categoria excluída", variant: "success" });
      if (editing === id) setEditing(null);
      await refresh();
    } catch (e) {
      toast({
        title: "Não foi possível excluir",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{categories.length} categorias no catálogo.</p>
        {editing === null && (
          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" />
            Nova categoria
          </Button>
        )}
      </div>

      {editing !== null && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong mt-6 rounded-hero p-6 shadow-lift"
        >
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-display text-lg font-extrabold">
              {editing === "new" ? "Nova categoria" : "Editar categoria"}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              title="Fechar"
              className="grid size-9 cursor-pointer place-items-center rounded-xl glass text-dim transition-all hover:rotate-90 hover:text-text"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome *">
              <Input
                value={draft.name}
                onChange={(e) => {
                  setDraft((d) => ({
                    ...d,
                    name: e.target.value,
                    id: editing === "new" ? slugify(e.target.value) : d.id,
                  }));
                }}
                placeholder="Canecas Mágicas"
              />
            </Field>
            <Field label={editing === "new" ? "Id (automático)" : "Id"}>
              <Input
                value={draft.id}
                disabled={editing !== "new"}
                onChange={(e) => setDraft((d) => ({ ...d, id: slugify(e.target.value) }))}
                placeholder="canecas"
              />
            </Field>
            <Field label="Emoji *">
              <Input
                value={draft.emoji}
                onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
                placeholder="☕"
              />
            </Field>
            <Field label="Ícone (lucide)">
              <select
                value={draft.iconKey}
                onChange={(e) => setDraft((d) => ({ ...d, iconKey: e.target.value }))}
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text shadow-soft outline-none backdrop-blur-md transition-all duration-300 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
              >
                {CATALOG_ICON_KEYS.map((k) => (
                  <option key={k} value={k} className="bg-surface text-text">
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cor (hex)">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-12 w-14 cursor-pointer rounded-xl border border-white/10 bg-white/5 p-1"
                />
                <Input
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="flex-1"
                />
              </div>
            </Field>
            <Field label="Gradiente (tailwind)">
              <Input
                value={draft.gradient}
                onChange={(e) => setDraft((d) => ({ ...d, gradient: e.target.value }))}
                placeholder="from-orange-500/25 to-amber-500/10"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descrição curta">
                <Input
                  value={draft.blurb}
                  onChange={(e) => setDraft((d) => ({ ...d, blurb: e.target.value }))}
                  placeholder="Canecas que contam histórias"
                />
              </Field>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={saving || draft.name.trim().length < 2 || (editing === "new" && draft.id.trim().length === 0)}
              onClick={save}
            >
              {saving ? "Salvando…" : editing === "new" ? "Criar categoria" : "Salvar alterações"}
            </Button>
          </div>
        </motion.div>
      )}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <li
            key={c.id}
            className="glass flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/[0.05]"
          >
            <span
              className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-2xl"
              style={{ boxShadow: `0 0 18px ${c.color}40` }}
            >
              {c.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-text">{c.name}</p>
              <p className="truncate text-xs text-dim">{c.blurb}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" onClick={() => openEdit(c.id)}>
                <Pencil className="size-3.5" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Field com label + dica */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

