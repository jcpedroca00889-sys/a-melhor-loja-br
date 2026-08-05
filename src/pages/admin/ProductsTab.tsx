import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  History,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createAccounts,
  createAdminProduct,
  deleteAccount,
  deleteAccounts,
  deleteAdminProduct,
  exportAccounts,
  getAdminProducts,
  getProductAccounts,
  getProductMovements,
  importAccounts,
  updateAccount,
  updateAdminProduct,
  uploadProductImages,
  type AdminProduct,
  type AdminProductPayload,
  type ProductAccount,
  type ProductDto,
  type ProductMovement,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";
import {
  useCatalogCategories,
  useCatalogStore,
} from "@/lib/store/catalog-store";
import { makeImage } from "@/lib/db/image";
import { formatBRL } from "@/lib/format";
import { toast } from "@/lib/store/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ============================================================
   PRODUTOS TAB (Fase D) — CRUD de produtos com preview da imagem
   gerada, campos avançados (sku, tags, banner, estoque ilimitado,
   extras, faq, garantia, termos) e gestão de contas de estoque
   (single/bulk/import/export/edição/exclusão) + movimentações.
   ============================================================ */

const BADGES = ["novo", "promocao", "popular", "limitado", "mais-vendido"] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface ExtraRow {
  label: string;
  value: string;
}

interface FaqRow {
  q: string;
  a: string;
}

interface ProductDraft {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  price: string;
  oldPrice: string;
  categoryId: string;
  emoji: string;
  hueA: string;
  hueB: string;
  imageUrls: string[];
  badges: string[];
  rating: string;
  reviews: string;
  stock: string;
  featured: boolean;
  deliveryMode: "auto" | "adm" | "manual";
  sku: string;
  tags: string;
  banner: string;
  active: boolean;
  maxQty: string;
  unlimitedStock: boolean;
  hideWhenZero: boolean;
  extras: ExtraRow[];
  faq: FaqRow[];
  garantia: string;
  termos: string;
}

const EMPTY_PRODUCT: ProductDraft = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  price: "",
  oldPrice: "",
  categoryId: "",
  emoji: "🛍️",
  hueA: "#F97316",
  hueB: "#FF8A00",
  imageUrls: [],
  badges: [],
  rating: "4.5",
  reviews: "0",
  stock: "0",
  featured: false,
  deliveryMode: "manual",
  sku: "",
  tags: "",
  banner: "",
  active: true,
  maxQty: "",
  unlimitedStock: false,
  hideWhenZero: false,
  extras: [],
  faq: [],
  garantia: "",
  termos: "",
};

const DELIVERY_META: Record<"auto" | "adm" | "manual", { label: string; className: string }> = {
  auto: { label: "Entrega automática", className: "bg-success/15 text-success" },
  adm: { label: "Entrega pelo admin", className: "bg-sky-400/15 text-sky-400" },
  manual: { label: "Entrega manual", className: "bg-amber-400/15 text-amber-400" },
};

/** Converte o DTO devolvido por POST/PATCH para o shape AdminProduct da lista,
    com defaults para os campos opcionais que nem toda resposta serializa. */
function toAdminProduct(dto: ProductDto): AdminProduct {
  return {
    slug: dto.slug,
    name: dto.name,
    tagline: dto.tagline,
    description: dto.description,
    price: dto.price,
    oldPrice: dto.oldPrice ?? null,
    categoryId: dto.categoryId,
    emoji: dto.emoji,
    hueA: dto.hueA,
    hueB: dto.hueB,
    badges: dto.badges,
    rating: dto.rating,
    reviews: dto.reviews,
    stock: dto.stock ?? 0,
    deliveryMode: dto.deliveryMode,
    featured: Boolean(dto.featured),
    sku: dto.sku,
    tags: dto.tags,
    banner: dto.banner,
    active: dto.active ?? true,
    maxQty: dto.maxQty,
    unlimitedStock: dto.unlimitedStock,
    hideWhenZero: dto.hideWhenZero,
    extras: dto.extras,
    faq: dto.faq,
    garantia: dto.garantia,
    termos: dto.termos,
  };
}

export default function ProductsTab() {
  const categories = useCatalogCategories();
  const refresh = useCatalogStore((s) => s.refresh);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);
  // modais
  const [accountsFor, setAccountsFor] = useState<string | null>(null);
  const [movementsFor, setMovementsFor] = useState<string | null>(null);
  // Lista admin (GET /api/admin/products) — inclui produtos inativos, então o
  // badge "Inativo" e a reativação funcionam sem o workaround de retenção.
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await getAdminProducts(token);
      setProducts(data);
    } catch (e) {
      if (!silent) {
        toast({
          title: "Não foi possível carregar os produtos",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* auto-refresh leve a cada 30s (preserva estado) */
  useEffect(() => {
    const t = setInterval(() => {
      void load(true);
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const findProduct = (slug: string): AdminProduct | undefined =>
    products.find((x) => x.slug === slug);

  const openNew = () => {
    setDraft({ ...EMPTY_PRODUCT, categoryId: categories[0]?.id ?? "" });
    setEditing("new");
  };

  const openEdit = (slug: string) => {
    const p = findProduct(slug);
    if (!p) return;
    setDraft({
      name: p.name,
      slug: p.slug,
      tagline: p.tagline,
      description: p.description,
      price: String(p.price),
      oldPrice: p.oldPrice ? String(p.oldPrice) : "",
      categoryId: p.categoryId,
      emoji: p.emoji,
      hueA: p.hueA,
      hueB: p.hueB,
      imageUrls: p.imageUrls ?? [],
      badges: [...p.badges],
      rating: String(p.rating),
      reviews: String(p.reviews),
      stock: String(p.stock === Number.MAX_SAFE_INTEGER ? 0 : p.stock),
      featured: p.featured,
      deliveryMode: p.deliveryMode ?? "manual",
      sku: p.sku ?? "",
      tags: (p.tags ?? []).join(", "),
      banner: p.banner ?? "",
      active: p.active ?? true,
      maxQty: p.maxQty ? String(p.maxQty) : "",
      unlimitedStock: p.unlimitedStock ?? false,
      hideWhenZero: p.hideWhenZero ?? false,
      extras: (p.extras ?? []).map((e) => ({ ...e })),
      faq: (p.faq ?? []).map((f) => ({ ...f })),
      garantia: p.garantia ?? "",
      termos: p.termos ?? "",
    });
    setEditing(slug);
  };

  const setField = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "name" && editing === "new") {
        next.slug = slugify(value as string);
      }
      return next;
    });
  };

  const toggleBadge = (badge: string) => {
    setDraft((d) => ({
      ...d,
      badges: d.badges.includes(badge)
        ? d.badges.filter((b) => b !== badge)
        : [...d.badges, badge],
    }));
  };

  const setExtra = (i: number, patch: Partial<ExtraRow>) => {
    setDraft((d) => ({
      ...d,
      extras: d.extras.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    }));
  };

  const setFaq = (i: number, patch: Partial<FaqRow>) => {
    setDraft((d) => ({
      ...d,
      faq: d.faq.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    }));
  };

  const save = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setSaving(true);
    const payload: AdminProductPayload = {
      name: draft.name,
      tagline: draft.tagline,
      description: draft.description,
      price: Number(draft.price),
      // D-P2-2: campos opcionais são enviados como `null` (não `undefined`) para
      // que o JSON.stringify não descarte a chave e o servidor consiga LIMPAR o
      // valor no PATCH (ex: apagar oldPrice/SKU/banner/garantia).
      oldPrice: draft.oldPrice ? Number(draft.oldPrice) : null,
      categoryId: draft.categoryId,
      emoji: draft.emoji,
      hueA: draft.hueA,
      hueB: draft.hueB,
      imageUrls: draft.imageUrls,
      badges: draft.badges,
      rating: Number(draft.rating),
      reviews: Number(draft.reviews),
      stock: Number(draft.stock),
      featured: draft.featured,
      deliveryMode: draft.deliveryMode,
      sku: draft.sku.trim() || null,
      tags: draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      banner: draft.banner.trim() || null,
      active: draft.active,
      maxQty: draft.maxQty ? Number(draft.maxQty) : null,
      unlimitedStock: draft.unlimitedStock,
      hideWhenZero: draft.hideWhenZero,
      extras: draft.extras.filter((e) => e.label.trim() && e.value.trim()),
      faq: draft.faq.filter((f) => f.q.trim() && f.a.trim()),
      garantia: draft.garantia.trim() || null,
      termos: draft.termos.trim() || null,
    };
    try {
      if (editing === "new") {
        const saved = await createAdminProduct(token, { ...payload, slug: draft.slug });
        // Merge imediato: coloca o produto criado no topo da lista local.
        setProducts((prev) => [toAdminProduct(saved), ...prev.filter((x) => x.slug !== saved.slug)]);
        toast({ title: "Produto criado! 🎉", variant: "success" });
      } else if (editing) {
        const saved = await updateAdminProduct(token, editing, payload);
        // Merge imediato: substitui o item atualizado na lista local.
        setProducts((prev) => prev.map((x) => (x.slug === saved.slug ? toAdminProduct(saved) : x)));
        toast({ title: "Produto atualizado ✨", variant: "success" });
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

  const remove = async (slug: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!window.confirm("Excluir este produto? As contas dele também serão removidas.")) return;
    try {
      await deleteAdminProduct(token, slug);
      toast({ title: "Produto excluído", variant: "success" });
      // Purga o item da lista local imediatamente.
      setProducts((prev) => prev.filter((p) => p.slug !== slug));
      if (editing === slug) setEditing(null);
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
        <p className="text-sm text-muted">
          {products.length} {products.length === 1 ? "produto" : "produtos"} no catálogo.
        </p>
        {editing === null && (
          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" />
            Novo produto
          </Button>
        )}
      </div>

      {editing !== null && (
        <ProductForm
          draft={draft}
          editing={editing}
          saving={saving}
          categories={categories}
          onField={setField}
          onToggleBadge={toggleBadge}
          onSetExtra={setExtra}
          onSetFaq={setFaq}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {loading && products.length === 0 ? (
        <p className="mt-8 text-center text-sm text-dim">Carregando produtos…</p>
      ) : products.length === 0 ? (
        <p className="mt-8 text-center text-sm text-dim">Nenhum produto no catálogo ainda.</p>
      ) : (
      <ul className="mt-6 space-y-3">
        {products.map((p) => {
          const cat = categories.find((c) => c.id === p.categoryId);
          const deliv = DELIVERY_META[p.deliveryMode ?? "manual"] ?? DELIVERY_META.manual;
          return (
            <li
              key={p.slug}
              className="glass flex flex-wrap items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-white/[0.05]"
            >
              <img
                src={makeImage(p.hueA, p.hueB, p.emoji, 0)}
                alt={p.name}
                className="size-14 shrink-0 rounded-xl border border-white/10 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-display text-sm font-bold text-text">
                  <span className="truncate">{p.name}</span>
                  {p.featured && <Star className="size-3.5 shrink-0 text-primary" />}
                  {p.active === false && (
                    <span className="rounded-full bg-error/15 px-2 py-0.5 text-[10px] font-bold text-error">
                      Inativo
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-dim">
                  <span>
                    {cat?.emoji} {cat?.name ?? "Sem categoria"}
                  </span>
                  <span>· {formatBRL(p.price)}</span>
                  <span>
                    · {p.unlimitedStock ? "estoque ilimitado" : p.stock > 0 ? `${p.stock} em estoque` : "sem estoque"}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", deliv.className)}>
                    {deliv.label}
                  </span>
                  {p.sku && <span className="font-mono">· SKU {p.sku}</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" title="Contas de estoque" onClick={() => setAccountsFor(p.slug)}>
                  <KeyRound className="size-3.5" />
                  Contas
                </Button>
                <Button size="sm" variant="ghost" title="Movimentações" onClick={() => setMovementsFor(p.slug)}>
                  <History className="size-3.5" />
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openEdit(p.slug)}>
                  <Pencil className="size-3.5" />
                  Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(p.slug)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      )}

      {accountsFor && (
        <AccountsModal slug={accountsFor} adminProducts={products} onClose={() => setAccountsFor(null)} />
      )}
      {movementsFor && (
        <MovementsModal slug={movementsFor} adminProducts={products} onClose={() => setMovementsFor(null)} />
      )}
    </div>
  );
}

/* ============================================================
   FORMULÁRIO DO PRODUTO — campos básicos + avançados (Fase D)
   ============================================================ */

function ProductForm({
  draft,
  editing,
  saving,
  categories,
  onField,
  onToggleBadge,
  onSetExtra,
  onSetFaq,
  onCancel,
  onSave,
}: {
  draft: ProductDraft;
  editing: string | null;
  saving: boolean;
  categories: { id: string; name: string; emoji: string }[];
  onField: <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => void;
  onToggleBadge: (badge: string) => void;
  onSetExtra: (i: number, patch: Partial<ExtraRow>) => void;
  onSetFaq: (i: number, patch: Partial<FaqRow>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [linksText, setLinksText] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    setUploading(true);
    try {
      const urls = await uploadProductImages(token, files);
      onField("imageUrls", [...draft.imageUrls, ...urls]);
      toast({ title: "Imagens enviadas! 🖼️", variant: "success" });
    } catch (err) {
      toast({
        title: "Não foi possível enviar as imagens",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAddLinks = () => {
    const urls = linksText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast({ title: "Cole as URLs primeiro", variant: "error" });
      return;
    }
    onField("imageUrls", [...draft.imageUrls, ...urls]);
    setLinksText("");
    toast({ title: `${urls.length} link(s) adicionado(s)`, variant: "success" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong mt-6 rounded-hero p-6 shadow-lift"
    >
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-display text-lg font-extrabold">
          {editing === "new" ? "Novo produto" : "Editar produto"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          title="Fechar"
          className="grid size-9 cursor-pointer place-items-center rounded-xl glass text-dim transition-all hover:rotate-90 hover:text-text"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <img
            src={makeImage(draft.hueA, draft.hueB, draft.emoji || "🛍️", 0)}
            alt="Preview do produto"
            className="aspect-square w-full rounded-hero border border-white/10"
          />
          <p className="text-xs text-dim">Preview da imagem gerada</p>
          {draft.banner && (
            <p className="w-full truncate rounded-xl bg-white/[0.04] px-3 py-2 text-center text-[11px] text-muted">
              Banner: <span className="font-mono text-primary">{draft.banner}</span>
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *">
            <Input
              value={draft.name}
              onChange={(e) => onField("name", e.target.value)}
              placeholder="Caneca Nova"
            />
          </Field>
          <Field label={editing === "new" ? "Slug (automático)" : "Slug"}>
            <Input
              value={draft.slug}
              disabled={editing !== "new"}
              onChange={(e) => onField("slug", slugify(e.target.value))}
              placeholder="caneca-nova"
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={draft.tagline}
              onChange={(e) => onField("tagline", e.target.value)}
              placeholder="Uma frase de efeito"
            />
          </Field>
          <Field label="Categoria *">
            <select
              value={draft.categoryId}
              onChange={(e) => onField("categoryId", e.target.value)}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text shadow-soft outline-none backdrop-blur-md transition-all duration-300 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-surface text-text">
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SKU">
            <Input
              value={draft.sku}
              onChange={(e) => onField("sku", e.target.value)}
              placeholder="ex: CANECA-001"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Tags (separadas por vírgula)">
            <Input
              value={draft.tags}
              onChange={(e) => onField("tags", e.target.value)}
              placeholder="presente, decoração"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição">
              <Textarea
                value={draft.description}
                onChange={(e) => onField("description", e.target.value)}
                rows={3}
                placeholder="Detalhes do produto…"
              />
            </Field>
          </div>

          {/* preço + estoque */}
          <Field label="Preço (R$) *">
            <Input
              value={draft.price}
              onChange={(e) => onField("price", e.target.value)}
              type="number"
              min={0}
              step="0.01"
              placeholder="49.90"
            />
          </Field>
          <Field label="Preço antigo (R$)">
            <Input
              value={draft.oldPrice}
              onChange={(e) => onField("oldPrice", e.target.value)}
              type="number"
              min={0}
              step="0.01"
              placeholder="69.90"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Nota">
              <Input
                value={draft.rating}
                onChange={(e) => onField("rating", e.target.value)}
                type="number"
                min={0}
                max={5}
                step="0.1"
              />
            </Field>
            <Field label="Avaliações">
              <Input
                value={draft.reviews}
                onChange={(e) => onField("reviews", e.target.value)}
                type="number"
                min={0}
              />
            </Field>
            <Field label="Estoque">
              <Input
                value={draft.stock}
                disabled={draft.unlimitedStock || draft.deliveryMode !== "manual"}
                onChange={(e) => onField("stock", e.target.value)}
                type="number"
                min={0}
              />
              {draft.deliveryMode !== "manual" && !draft.unlimitedStock && (
                <p className="text-xs text-dim">
                  Estoque controlado pelas contas disponíveis (agora: {draft.stock})
                </p>
              )}
            </Field>
          </div>
          <Field label="Qtd. máxima por pedido">
            <Input
              value={draft.maxQty}
              onChange={(e) => onField("maxQty", e.target.value)}
              type="number"
              min={1}
              step={1}
              placeholder="vazio = sem limite"
            />
          </Field>
          <Field label="Modo de entrega">
            <select
              value={draft.deliveryMode}
              onChange={(e) => onField("deliveryMode", e.target.value as ProductDraft["deliveryMode"])}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text shadow-soft outline-none backdrop-blur-md transition-all duration-300 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
            >
              <option value="auto" className="bg-surface text-text">
                Entrega automática (conta imediata)
              </option>
              <option value="adm" className="bg-surface text-text">
                Entrega pelo admin (após pagamento)
              </option>
              <option value="manual" className="bg-surface text-text">
                Entrega manual (conversa com cliente)
              </option>
            </select>
          </Field>

          {/* emoji + cores */}
          <Field label="Emoji *">
            <Input
              value={draft.emoji}
              onChange={(e) => onField("emoji", e.target.value)}
              placeholder="🚀"
            />
          </Field>
          <Field label="Banner (URL ou cor)">
            <Input
              value={draft.banner}
              onChange={(e) => onField("banner", e.target.value)}
              placeholder="https://…/banner.png ou #1a0f00"
            />
          </Field>
          <Field label="Cores (hueA / hueB)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.hueA}
                onChange={(e) => onField("hueA", e.target.value)}
                className="h-12 w-14 cursor-pointer rounded-xl border border-white/10 bg-white/5 p-1"
              />
              <input
                type="color"
                value={draft.hueB}
                onChange={(e) => onField("hueB", e.target.value)}
                className="h-12 w-14 cursor-pointer rounded-xl border border-white/10 bg-white/5 p-1"
              />
              <Input
                value={draft.hueA}
                onChange={(e) => onField("hueA", e.target.value)}
                placeholder="#F97316"
                className="flex-1"
              />
              <Input
                value={draft.hueB}
                onChange={(e) => onField("hueB", e.target.value)}
                placeholder="#FF8A00"
                className="flex-1"
              />
            </div>
          </Field>

          {/* imagens — fotos reais ou links; vazio = arte gerada do emoji */}
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-muted">Imagens</span>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              {draft.imageUrls.length === 0 ? (
                <p className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs text-dim">
                  Sem imagens — será usada a arte gerada do emoji.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {draft.imageUrls.map((url, i) => (
                    <div
                      key={i}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-white/10"
                    >
                      <img
                        src={url}
                        alt={`Imagem ${i + 1}`}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <button
                        type="button"
                        onClick={() => onField("imageUrls", draft.imageUrls.filter((_, j) => j !== i))}
                        title="Remover imagem"
                        className="absolute right-1 top-1 grid size-6 cursor-pointer place-items-center rounded-lg bg-black/60 text-white opacity-80 backdrop-blur transition-all hover:bg-error hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3">
                <input
                  id="product-images-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={(e) => void handleUpload(e)}
                  className="hidden"
                />
                <label
                  htmlFor="product-images-upload"
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-sm font-semibold text-muted transition-all",
                    uploading
                      ? "cursor-wait opacity-60"
                      : "hover:border-primary/40 hover:bg-primary/5 hover:text-text",
                  )}
                >
                  <Upload className="size-4" />
                  {uploading ? "Enviando…" : "Enviar fotos"}
                </label>
              </div>

              <div className="mt-3">
                <Textarea
                  value={linksText}
                  onChange={(e) => setLinksText(e.target.value)}
                  rows={2}
                  placeholder="Cole URLs externas, uma por linha…"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-dim">Uma URL por linha — fica em primeiro a primeira enviada.</p>
                  <Button size="sm" variant="secondary" onClick={handleAddLinks}>
                    <Link2 className="size-3.5" />
                    Adicionar links
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* toggles */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
            <ToggleRow checked={draft.active} onChange={(v) => onField("active", v)}>
              Produto ativo na vitrine
            </ToggleRow>
            <ToggleRow checked={draft.unlimitedStock} onChange={(v) => onField("unlimitedStock", v)}>
              Estoque ilimitado
            </ToggleRow>
            <ToggleRow checked={draft.hideWhenZero} onChange={(v) => onField("hideWhenZero", v)}>
              Esconder quando zerar
            </ToggleRow>
          </div>

          {/* badges */}
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-muted">Badges</span>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onToggleBadge(b)}
                  className={cn(
                    "cursor-pointer rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
                    draft.badges.includes(b)
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-white/10 text-dim hover:text-text",
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(e) => onField("featured", e.target.checked)}
              className="size-4 accent-orange-500"
            />
            <span className="text-sm font-semibold text-muted">
              <Star className="mr-1 inline size-3.5 text-primary" />
              Destaque na vitrine
            </span>
          </label>

          {/* extras */}
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Extras (rótulo → valor)</span>
              <button
                type="button"
                onClick={() => onSetExtra(draft.extras.length, { label: "", value: "" })}
                className="flex cursor-pointer items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary transition-all hover:bg-primary/25 active:scale-95"
              >
                <Plus className="size-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {draft.extras.length === 0 && (
                <p className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs text-dim">
                  Nenhum extra — ex: "Resolução máxima 4K" → "Sim".
                </p>
              )}
              {draft.extras.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={e.label}
                    onChange={(ev) => onSetExtra(i, { label: ev.target.value })}
                    placeholder="Rótulo"
                    className="flex-1"
                  />
                  <Input
                    value={e.value}
                    onChange={(ev) => onSetExtra(i, { value: ev.target.value })}
                    placeholder="Valor"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onField("extras", draft.extras.filter((_, j) => j !== i))}
                    title="Remover"
                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-dim transition-colors hover:bg-error/10 hover:text-error"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* faq */}
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Perguntas frequentes</span>
              <button
                type="button"
                onClick={() => onSetFaq(draft.faq.length, { q: "", a: "" })}
                className="flex cursor-pointer items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary transition-all hover:bg-primary/25 active:scale-95"
              >
                <Plus className="size-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {draft.faq.length === 0 && (
                <p className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs text-dim">
                  Nenhuma pergunta — ex: "Como recebo?" / "No e-mail na hora".
                </p>
              )}
              {draft.faq.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-2">
                    <Input
                      value={f.q}
                      onChange={(ev) => onSetFaq(i, { q: ev.target.value })}
                      placeholder="Pergunta"
                    />
                    <Input
                      value={f.a}
                      onChange={(ev) => onSetFaq(i, { a: ev.target.value })}
                      placeholder="Resposta"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onField("faq", draft.faq.filter((_, j) => j !== i))}
                    title="Remover"
                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-dim transition-colors hover:bg-error/10 hover:text-error"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* garantia + termos */}
          <div className="sm:col-span-2">
            <Field label="Garantia">
              <Input
                value={draft.garantia}
                onChange={(e) => onField("garantia", e.target.value)}
                placeholder="7 dias de garantia"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Termos de uso">
              <Textarea
                value={draft.termos}
                onChange={(e) => onField("termos", e.target.value)}
                rows={3}
                placeholder="Condições de uso do produto…"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={saving} onClick={onSave}>
          {saving ? "Salvando…" : editing === "new" ? "Criar produto" : "Salvar alterações"}
        </Button>
      </div>
    </motion.div>
  );
}

/* ============================================================
   MODAL DE CONTAS — listar, criar (single/bulk), importar,
   exportar, editar e excluir contas de estoque do produto.
   ============================================================ */

const ACTION_META: Record<string, { label: string; className: string }> = {
  add: { label: "Adicionada", className: "bg-success/15 text-success" },
  import: { label: "Importada", className: "bg-sky-400/15 text-sky-400" },
  create: { label: "Criada", className: "bg-success/15 text-success" },
  claim: { label: "Entregue", className: "bg-primary/15 text-primary" },
  release: { label: "Devolvida", className: "bg-purple-400/15 text-purple-400" },
  set: { label: "Estoque ajustado", className: "bg-amber-400/15 text-amber-400" },
  sale: { label: "Venda", className: "bg-error/15 text-error" },
  refund: { label: "Reembolso", className: "bg-sky-400/15 text-sky-400" },
};

function AccountsModal({ slug, adminProducts, onClose }: { slug: string; adminProducts: AdminProduct[]; onClose: () => void }) {
  // P3: nome via lista admin (GET /admin/products), que inclui produtos
  // inativos — o catálogo público (useCatalogProducts) exclui inativos.
  const product = adminProducts.find((p) => p.slug === slug);
  const [accounts, setAccounts] = useState<ProductAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  // criação
  const [mode, setMode] = useState<"list" | "single" | "bulk">("list");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigoExtra, setCodigoExtra] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  // gerador de N contas (D-P2-3)
  const [genCount, setGenCount] = useState("10");
  const [generating, setGenerating] = useState(false);
  // edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ email: string; password: string; codigoExtra: string; observacoes: string }>({
    email: "",
    password: "",
    codigoExtra: "",
    observacoes: "",
  });
  // seleção p/ exclusão em lote
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    setLoading(true);
    try {
      const data = await getProductAccounts(token, slug);
      setAccounts(data);
    } catch (e) {
      toast({
        title: "Não foi possível carregar as contas",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = useMemo(
    () => (accounts ?? []).filter((a) => !a.used).length,
    [accounts],
  );

  const addSingle = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!email.trim() || !password.trim()) {
      toast({ title: "E-mail e senha são obrigatórios", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await createAccounts(token, slug, [
        {
          email: email.trim(),
          password: password.trim(),
          codigoExtra: codigoExtra.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        },
      ]);
      toast({ title: "Conta adicionada! 🔑", variant: "success" });
      setEmail("");
      setPassword("");
      setCodigoExtra("");
      setObservacoes("");
      await load();
    } catch (e) {
      toast({
        title: "Não foi possível adicionar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const addBulk = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast({ title: "Cole as contas primeiro", variant: "error" });
      return;
    }
    const parsed = lines
      .map((line) => {
        // formato aceito: "email:senha" | "email|senha" | "email senha"
        const parts = line.split(/[:|;,\s]+/).filter(Boolean);
        if (parts.length < 2) return null;
        return { email: parts[0], password: parts.slice(1).join(" ") };
      })
      .filter((x): x is { email: string; password: string } => x !== null);
    if (parsed.length === 0) {
      toast({ title: "Nenhuma conta válida no texto", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const created = await createAccounts(token, slug, parsed);
      toast({ title: `${created.length} conta(s) adicionadas! 🎉`, variant: "success" });
      setBulkText("");
      await load();
    } catch (e) {
      toast({
        title: "Não foi possível adicionar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const doImport = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!importText.trim()) {
      toast({ title: "Cole o texto para importar", variant: "error" });
      return;
    }
    setImporting(true);
    try {
      const res = await importAccounts(token, slug, importText);
      toast({
        title: "Importação concluída",
        description: `${res.created} criada(s), ${res.duplicates} duplicada(s), ${res.skipped} ignorada(s).`,
        variant: "success",
      });
      setImportText("");
      await load();
    } catch (e) {
      toast({
        title: "Não foi possível importar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  const doExport = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      await exportAccounts(token, slug);
      toast({ title: "Contas exportadas! 📦", variant: "success" });
    } catch (e) {
      toast({
        title: "Não foi possível exportar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    }
  };

  /** D-P2-3: gera N contas aleatórias (e-mail/senha únicos) de uma vez. */
  const generateAccounts = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const n = Math.max(1, Math.min(200, Math.floor(Number(genCount)) || 1));
    const stamp = Date.now().toString(36);
    const accounts = Array.from({ length: n }, (_, i) => {
      const idx = `${stamp}${i.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      return {
        email: `conta${idx}@gerada.local`,
        password: `gen-${idx}`,
      };
    });
    setGenerating(true);
    try {
      const created = await createAccounts(token, slug, accounts);
      toast({ title: `${created.length} conta(s) gerada(s)! 🎉`, variant: "success" });
      await load();
    } catch (e) {
      toast({
        title: "Não foi possível gerar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (a: ProductAccount) => {
    const combined = a.emailPassword ? a.emailPassword.split(":") : [];
    setEditingId(a.id);
    setEditDraft({
      email: a.email || combined[0] || "",
      password: a.password || combined[1] || "",
      codigoExtra: a.codigoExtra ?? "",
      observacoes: a.observacoes ?? "",
    });
  };

  const saveEdit = async () => {
    const token = useAuthStore.getState().token;
    if (!token || !editingId) return;
    setSaving(true);
    try {
      await updateAccount(token, editingId, {
        email: editDraft.email.trim(),
        password: editDraft.password.trim(),
        codigoExtra: editDraft.codigoExtra.trim() || undefined,
        observacoes: editDraft.observacoes.trim() || undefined,
      });
      toast({ title: "Conta atualizada ✨", variant: "success" });
      setEditingId(null);
      await load();
    } catch (e) {
      toast({
        title: "Não foi possível atualizar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeSingle = async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!window.confirm("Excluir esta conta?")) return;
    try {
      await deleteAccount(token, id);
      toast({ title: "Conta excluída", variant: "success" });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load();
    } catch (e) {
      toast({
        title: "Não foi possível excluir",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    }
  };

  const removeBatch = async () => {
    const token = useAuthStore.getState().token;
    if (!token || selected.size === 0) return;
    if (!window.confirm(`Excluir ${selected.size} conta(s) selecionada(s)?`)) return;
    setDeleting(true);
    try {
      await deleteAccounts(token, [...selected]);
      toast({ title: `${selected.size} conta(s) excluída(s)`, variant: "success" });
      setSelected(new Set());
      await load();
    } catch (e) {
      toast({
        title: "Não foi possível excluir",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const total = accounts?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong relative w-full max-w-3xl rounded-hero p-6 shadow-lift"
      >
        <button
          type="button"
          onClick={onClose}
          title="Fechar"
          className="absolute right-4 top-4 grid size-9 cursor-pointer place-items-center rounded-xl glass text-dim transition-all hover:rotate-90 hover:text-text"
        >
          <X className="size-4" />
        </button>

        <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
          <KeyRound className="size-5 text-primary" />
          Contas · <span className="truncate text-gradient">{product?.name ?? slug}</span>
        </h3>
        <p className="mt-1 text-xs text-dim">
          {loading ? "Carregando contas…" : `${available} disponível(is) de ${total} no total.`}
        </p>

        {/* ações */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant={mode === "single" ? "default" : "secondary"} onClick={() => setMode("single")}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
          <Button size="sm" variant={mode === "bulk" ? "default" : "secondary"} onClick={() => setMode("bulk")}>
            <Upload className="size-3.5" /> Adicionar em massa
          </Button>
          <Button size="sm" variant={mode === "bulk" ? "secondary" : "ghost"} onClick={() => setMode("bulk")} title="Importar de texto">
            <Upload className="size-3.5" /> Importar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void doExport()}>
            <Download className="size-3.5" /> Exportar
          </Button>
          <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] p-1">
            <Input
              type="number"
              min={1}
              max={200}
              value={genCount}
              onChange={(e) => setGenCount(e.target.value)}
              className="h-8 w-16 px-2 text-center text-xs"
              title="Quantidade de contas a gerar"
              aria-label="Quantidade de contas a gerar"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={generating}
              onClick={() => void generateAccounts()}
              title="Gera contas aleatórias automaticamente"
            >
              <Sparkles className="size-3.5" />
              {generating ? "Gerando…" : "Gerar N contas"}
            </Button>
          </div>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" disabled={deleting} onClick={() => void removeBatch()}>
              <Trash2 className="size-3.5" /> Excluir {selected.size}
            </Button>
          )}
        </div>

        {/* formulário de criação */}
        {mode === "single" && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
            <Field label="E-mail / usuário *">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@exemplo.com" />
            </Field>
            <Field label="Senha *">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <Field label="Código extra">
              <Input value={codigoExtra} onChange={(e) => setCodigoExtra(e.target.value)} placeholder="perfil #1" />
            </Field>
            <Field label="Observações">
              <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="conta principal" />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="ghost" size="sm" onClick={() => setMode("list")}>
                Cancelar
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void addSingle()}>
                {saving ? "Adicionando…" : "Adicionar conta"}
              </Button>
            </div>
          </div>
        )}

        {mode === "bulk" && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-muted">Adicionar em massa</span>
              <Textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={5}
                placeholder={"cliente@exemplo.com:senha123\noutro@exemplo.com|outrasenha"}
              />
              <p className="mt-1 text-[11px] text-dim">
                Uma conta por linha — separe e-mail e senha com ":" , "|" ou espaço.
              </p>
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-muted">Importar de texto</span>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={5}
                placeholder="Colar lista de contas aqui (ignora duplicadas)…"
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="ghost" size="sm" onClick={() => setMode("list")}>
                Cancelar
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void addBulk()}>
                {saving ? "Adicionando…" : "Adicionar contas"}
              </Button>
              <Button size="sm" variant="secondary" disabled={importing} onClick={() => void doImport()}>
                <Upload className="size-3.5" />
                {importing ? "Importando…" : "Importar"}
              </Button>
            </div>
          </div>
        )}

        {/* lista */}
        <div className="mt-5 max-h-[45vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2">
          {loading && accounts === null ? (
            <p className="px-3 py-6 text-center text-sm text-dim">Carregando…</p>
          ) : total === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <span className="text-4xl">🔑</span>
              <p className="font-display text-sm font-bold text-text">Nenhuma conta ainda</p>
              <p className="max-w-xs text-xs text-dim">
                Adicione a primeira conta de estoque ou importe uma lista em lote.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {accounts?.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                    a.used ? "bg-white/[0.02] opacity-70" : "bg-white/[0.05]",
                    selected.has(a.id) && "ring-1 ring-primary/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    className="size-4 accent-orange-500"
                  />
                  {editingId === a.id ? (
                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                      <Input value={editDraft.email} onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))} />
                      <Input value={editDraft.password} onChange={(e) => setEditDraft((d) => ({ ...d, password: e.target.value }))} />
                      <Input
                        value={editDraft.codigoExtra}
                        onChange={(e) => setEditDraft((d) => ({ ...d, codigoExtra: e.target.value }))}
                        placeholder="código extra"
                      />
                      <Input
                        value={editDraft.observacoes}
                        onChange={(e) => setEditDraft((d) => ({ ...d, observacoes: e.target.value }))}
                        placeholder="observações"
                      />
                      <div className="flex justify-end gap-2 sm:col-span-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" disabled={saving} onClick={() => void saveEdit()}>
                          {saving ? "Salvando…" : "Salvar"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text">
                          {a.email || a.emailPassword?.split(":")[0] || "(sem e-mail)"}
                          {a.password && (
                            <span className="ml-2 font-mono text-xs text-dim">••••</span>
                          )}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-dim">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              a.used ? "bg-error/15 text-error" : "bg-success/15 text-success",
                            )}
                          >
                            {a.used ? "Entregue" : "Disponível"}
                          </span>
                          {a.codigoExtra && <span>· código: {a.codigoExtra}</span>}
                          {a.observacoes && <span className="truncate">· {a.observacoes}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button size="sm" variant="ghost" title="Editar" onClick={() => startEdit(a)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="destructive" title="Excluir" onClick={() => void removeSingle(a.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ============================================================
   MODAL DE MOVIMENTAÇÕES — timeline de estoque e contas.
   ============================================================ */

function MovementsModal({ slug, adminProducts, onClose }: { slug: string; adminProducts: AdminProduct[]; onClose: () => void }) {
  // P3: nome via lista admin (GET /admin/products), que inclui produtos
  // inativos — o catálogo público (useCatalogProducts) exclui inativos.
  const product = adminProducts.find((p) => p.slug === slug);
  const [movements, setMovements] = useState<ProductMovement[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      setLoading(true);
      try {
        const data = await getProductMovements(token, slug);
        setMovements(data);
      } catch (e) {
        toast({
          title: "Não foi possível carregar as movimentações",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "error",
        });
        setMovements([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [slug]);

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

        <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
          <History className="size-5 text-primary" />
          Movimentações · <span className="truncate text-gradient">{product?.name ?? slug}</span>
        </h3>
        <p className="mt-1 text-xs text-dim">Estoque e contas — histórico cronológico.</p>

        <div className="mt-5 max-h-[55vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2">
          {loading && movements === null ? (
            <p className="px-3 py-6 text-center text-sm text-dim">Carregando…</p>
          ) : !movements || movements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <span className="text-4xl">📜</span>
              <p className="font-display text-sm font-bold text-text">Sem movimentações</p>
              <p className="max-w-xs text-xs text-dim">
                Vendas, entregas, reembolsos e ajustes de estoque aparecem aqui.
              </p>
            </div>
          ) : (
            <ul className="relative space-y-3 px-2 py-3">
              {/* linha vertical */}
              <span className="absolute bottom-4 left-[19px] top-4 w-px bg-white/10" />
              {movements.map((m) => {
                const kindMeta =
                  m.kind === "account"
                    ? { label: "Conta", className: "bg-sky-400/15 text-sky-400" }
                    : { label: "Estoque", className: "bg-primary/15 text-primary" };
                const actionMeta = ACTION_META[m.action] ?? {
                  label: m.action,
                  className: "bg-white/[0.08] text-muted",
                };
                return (
                  <li key={m.id} className="relative flex items-start gap-3 pl-1">
                    <span
                      className={cn(
                        "z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold",
                        kindMeta.className,
                      )}
                    >
                      {m.kind === "account" ? "🔑" : "📦"}
                    </span>
                    <div className="min-w-0 flex-1 rounded-2xl bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", actionMeta.className)}>
                            {actionMeta.label}
                          </span>
                          <span className="text-[11px] text-dim">
                            {new Date(m.createdAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <span className="font-display text-xs font-extrabold text-text">
                          {m.qty > 0 ? "+" : ""}
                          {m.qty}
                        </span>
                      </div>
                      {m.note && <p className="mt-1 text-xs text-muted">{m.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------- peças locais ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-orange-500"
      />
      <span className="text-sm font-semibold text-muted">{children}</span>
    </label>
  );
}
