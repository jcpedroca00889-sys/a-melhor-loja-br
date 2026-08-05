import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import {
  api,
  type AdminCoupon,
  type CouponPayload,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";
import { useCatalogProducts } from "@/lib/store/catalog-store";
import { formatBRL } from "@/lib/format";
import { toast } from "@/lib/store/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ============================================================
   COUPONS TAB (Fase E) — cupons de desconto do painel admin.
   Lista + criar/editar (modal) + excluir (confirmação) + copiar
   código. Validações client-side espelhando o servidor
   (código [A-Z0-9_-]{3,40}, valor > 0, percent < 100).
   ============================================================ */

const CODE_RE = /^[A-Z0-9_-]{3,40}$/;

const TYPE_META: Record<"fixed" | "percent", { label: string; className: string }> = {
  fixed: { label: "R$ fixo", className: "bg-sky-400/15 text-sky-400" },
  percent: { label: "%", className: "bg-purple-400/15 text-purple-400" },
};

interface CouponDraft {
  code: string;
  type: "fixed" | "percent";
  value: string;
  minValue: string;
  maxUses: string;
  active: boolean;
  expiresAt: string; // YYYY-MM-DD ou ""
  productSlugs: string[];
}

const EMPTY_DRAFT: CouponDraft = {
  code: "",
  type: "fixed",
  value: "",
  minValue: "",
  maxUses: "",
  active: true,
  expiresAt: "",
  productSlugs: [],
};

const shortDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export default function CouponsTab() {
  const products = useCatalogProducts();

  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null); // id | "new" | fechado
  const [draft, setDraft] = useState<CouponDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminCoupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await api<{ coupons: AdminCoupon[] }>("/admin/coupons", { token });
      setCoupons(data.coupons);
    } catch (e) {
      if (!silent) {
        toast({
          title: "Não foi possível carregar os cupons",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "error",
        });
      }
      setCoupons((prev) => prev ?? []);
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

  const openNew = () => {
    setDraft({ ...EMPTY_DRAFT });
    setEditing("new");
  };

  const openEdit = (c: AdminCoupon) => {
    setDraft({
      code: c.code,
      type: c.type,
      value: String(c.value),
      minValue: c.minValue > 0 ? String(c.minValue) : "",
      maxUses: c.maxUses ? String(c.maxUses) : "",
      active: c.active,
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 10) : "",
      productSlugs: c.productSlugs ?? [],
    });
    setEditing(c.id);
  };

  /** Validação client-side espelhando o servidor. Retorna mensagem ou null. */
  const validate = (): string | null => {
    const code = draft.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      return "Código inválido. Use 3-40 caracteres (letras, números, _ ou -).";
    }
    const value = Number(draft.value);
    if (!Number.isFinite(value) || value <= 0) {
      return "Valor do desconto deve ser maior que zero.";
    }
    if (draft.type === "percent" && value >= 100) {
      return "Cupom percentual deve ser menor que 100%.";
    }
    if (draft.maxUses.trim()) {
      const n = Number(draft.maxUses);
      if (!Number.isInteger(n) || n <= 0) {
        return "Usos máximos deve ser um número inteiro maior que zero.";
      }
    }
    if (draft.minValue.trim() && (Number(draft.minValue) < 0 || !Number.isFinite(Number(draft.minValue)))) {
      return "Valor mínimo do pedido deve ser maior ou igual a zero.";
    }
    return null;
  };

  const save = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const error = validate();
    if (error) {
      toast({ title: "Confira o formulário", description: error, variant: "error" });
      return;
    }
    setSaving(true);
    const payload: CouponPayload = {
      code: draft.code.trim().toUpperCase(),
      type: draft.type,
      value: Number(draft.value),
      minValue: draft.minValue.trim() ? Number(draft.minValue) : 0,
      maxUses: draft.maxUses.trim() ? Math.floor(Number(draft.maxUses)) : null,
      active: draft.active,
      expiresAt: draft.expiresAt ? new Date(`${draft.expiresAt}T23:59:59`).toISOString() : null,
      // lista vazia = todos os produtos → não envia productSlugs (evita "[]" no servidor)
      productSlugs: draft.productSlugs.length ? draft.productSlugs : undefined,
    };
    try {
      if (editing === "new") {
        await api<{ coupon: AdminCoupon }>("/admin/coupons", {
          method: "POST",
          token,
          body: JSON.stringify(payload),
        });
        toast({ title: "Cupom criado! 🎉", description: `Código ${payload.code}`, variant: "success" });
      } else if (editing) {
        await api<{ coupon: AdminCoupon }>(`/admin/coupons/${editing}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(payload),
        });
        toast({ title: "Cupom atualizado ✨", variant: "success" });
      }
      setEditing(null);
      void load(true);
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

  const remove = async () => {
    const token = useAuthStore.getState().token;
    if (!token || !confirmDelete) return;
    setDeleting(true);
    try {
      await api(`/admin/coupons/${confirmDelete.id}`, { method: "DELETE", token });
      toast({ title: "Cupom excluído", description: `Código ${confirmDelete.code}`, variant: "success" });
      if (editing === confirmDelete.id) setEditing(null);
      setConfirmDelete(null);
      void load(true);
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

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Código copiado! 📋", description: code, variant: "success" });
    } catch {
      /* clipboard indisponível */
    }
  };

  const toggleProduct = (slug: string) => {
    setDraft((d) => ({
      ...d,
      productSlugs: d.productSlugs.includes(slug)
        ? d.productSlugs.filter((s) => s !== slug)
        : [...d.productSlugs, slug],
    }));
  };

  /* ---------- render ---------- */

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {coupons === null ? "Carregando cupons…" : `${coupons.length} ${coupons.length === 1 ? "cupom" : "cupons"} no sistema.`}
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" />
          Novo cupom
        </Button>
      </div>

      {/* LISTA */}
      {loading && coupons === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-hero" />
          ))}
        </div>
      ) : coupons?.length === 0 ? (
        <div className="glass rounded-hero p-10 text-center shadow-soft">
          <motion.span
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block text-5xl"
          >
            🏷️
          </motion.span>
          <h3 className="mt-4 font-display text-lg font-extrabold">
            Nenhum <span className="text-gradient">cupom</span> ainda
          </h3>
          <p className="mt-1 text-sm text-muted">
            Crie o primeiro desconto para a loja usando o botão “Novo cupom”.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {coupons?.map((c) => {
            const type = TYPE_META[c.type] ?? TYPE_META.fixed;
            const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < Date.now() : false;
            return (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "glass rounded-hero p-5 shadow-soft transition-colors hover:bg-white/[0.04]",
                  !c.active && "opacity-75",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* código + meta */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-lg font-extrabold tracking-wide text-text">{c.code}</p>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", type.className)}>
                        {type.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                          !c.active
                            ? "bg-white/[0.08] text-dim"
                            : expired
                              ? "bg-error/15 text-error"
                              : "bg-success/15 text-success",
                        )}
                      >
                        {!c.active ? "Inativo" : expired ? "Expirado" : "Ativo"}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-dim">
                      <span className="font-display font-bold text-primary">
                        {c.type === "fixed" ? formatBRL(c.value) : `${c.value}%`} de desconto
                      </span>
                      {c.minValue > 0 && <span>· mín. {formatBRL(c.minValue)}</span>}
                      <span>· usos {c.usesCount}/{c.maxUses ?? "∞"}</span>
                      <span>· {c.productSlugs && c.productSlugs.length > 0 ? `${c.productSlugs.length} produto(s)` : "todos os produtos"}</span>
                      <span>· válido até {shortDate(c.expiresAt)}</span>
                    </p>
                  </div>

                  {/* ações */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="ghost" title="Copiar código" onClick={() => void copyCode(c.code)}>
                      <Copy className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Editar" onClick={() => openEdit(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="destructive" title="Excluir" onClick={() => setConfirmDelete(c)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* MODAL — CRIAR/EDITAR */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong relative w-full max-w-xl rounded-hero p-6 shadow-lift"
          >
            <button
              type="button"
              onClick={() => setEditing(null)}
              title="Fechar"
              className="absolute right-4 top-4 grid size-9 cursor-pointer place-items-center rounded-xl glass text-dim transition-all hover:rotate-90 hover:text-text"
            >
              <X className="size-4" />
            </button>

            <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
              <Tag className="size-5 text-primary" />
              {editing === "new" ? "Novo cupom" : "Editar cupom"}
            </h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Código *">
                <Input
                  value={draft.code}
                  onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
                  placeholder="PROMO10"
                  className="font-mono uppercase tracking-wide"
                />
                <p className="mt-1 text-[11px] text-dim">3-40 caracteres: letras, números, _ ou -.</p>
              </Field>

              <Field label="Tipo *">
                <select
                  value={draft.type}
                  onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as "fixed" | "percent" }))}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text shadow-soft outline-none backdrop-blur-md transition-all duration-300 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                >
                  <option value="fixed" className="bg-surface text-text">
                    Desconto fixo (R$)
                  </option>
                  <option value="percent" className="bg-surface text-text">
                    Percentual (%)
                  </option>
                </select>
              </Field>

              <Field label={draft.type === "fixed" ? "Valor (R$) *" : "Percentual (%) *"}>
                <Input
                  value={draft.value}
                  onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={draft.type === "fixed" ? "10.00" : "15"}
                />
              </Field>

              <Field label="Valor mínimo do pedido (R$)">
                <Input
                  value={draft.minValue}
                  onChange={(e) => setDraft((d) => ({ ...d, minValue: e.target.value }))}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                />
              </Field>

              <Field label="Validade">
                <Input
                  value={draft.expiresAt}
                  onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))}
                  type="date"
                />
              </Field>

              <Field label="Usos máximos">
                <Input
                  value={draft.maxUses}
                  onChange={(e) => setDraft((d) => ({ ...d, maxUses: e.target.value }))}
                  type="number"
                  min={1}
                  step={1}
                  placeholder="vazio = ilimitado"
                />
              </Field>

              <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                  className="size-4 accent-orange-500"
                />
                <span className="text-sm font-semibold text-muted">Cupom ativo</span>
              </label>

              {/* produtos */}
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-semibold text-muted">
                  Produtos específicos{" "}
                  <span className="font-normal text-dim">(vazio = vale para todos)</span>
                </span>
                <div className="max-h-44 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  {products.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-dim">
                      Nenhum produto no catálogo — o cupom valerá para todos.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {products.map((p) => {
                        const on = draft.productSlugs.includes(p.slug);
                        return (
                          <button
                            key={p.slug}
                            type="button"
                            onClick={() => toggleProduct(p.slug)}
                            className={cn(
                              "flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
                              on
                                ? "border-primary/60 bg-primary/15 text-primary"
                                : "border-white/10 text-dim hover:text-text",
                            )}
                          >
                            <span>{p.emoji}</span>
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {draft.productSlugs.length > 0 && (
                  <p className="mt-1 text-[11px] text-dim">
                    {draft.productSlugs.length} produto(s) selecionado(s) — o cupom só vale para eles.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving ? "Salvando…" : editing === "new" ? "Criar cupom" : "Salvar alterações"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL — CONFIRMAR EXCLUSÃO */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong relative w-full max-w-md rounded-hero p-6 shadow-lift"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-error/15 text-error">
                <Trash2 className="size-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-extrabold">Excluir cupom?</h3>
                <p className="mt-1 text-sm text-muted">
                  O código <span className="font-mono font-bold text-text">{confirmDelete.code}</span> deixará de
                  valer na loja. Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" disabled={deleting} onClick={() => void remove()}>
                {deleting ? "Excluindo…" : "Excluir cupom"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ---------- peça local ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
