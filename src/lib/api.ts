/* ============================================================
   API — cliente HTTP do backend SATOSHII STORE.
   Todas as chamadas passam pelo proxy Vite (/api → :3001).
   Erros não-2xx viram ApiError com mensagem amigável.
   ============================================================ */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface User {
  id: string;
  username: string;
  avatar: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  qty: number;
  name?: string;
  price?: number;
  image?: string;
}

export type OrderStatus = "pending" | "approved" | "delivered" | "cancelled";

export interface DeliveryInfo {
  message: string;
}

export interface Order {
  id: string;
  createdAt: string;
  status: OrderStatus;
  processedAt: string | null;
  delivery: DeliveryInfo | null;
  customer: { name: string; email: string; phone: string };
  shipping: {
    cep: string;
    street: string;
    number: string;
    complement: string | null;
    city: string;
    state: string;
  };
  cardLast4: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  couponCode: string | null;
  discountAmount: number;
}

export interface AdminOrder extends Order {
  user: { id: string; username: string } | null;
  /** Somente na serialização admin (Fase A1) */
  paymentId: string | null;
  paymentStatus: string | null;
  paymentProvider: string | null;
  expiresAt: number | null;
  deliveryMode: "auto" | "adm" | "manual" | null;
  needsManual: boolean;
}

/* ---------- relatórios e auditoria (suite admin — Fase A1/B) ---------- */

export interface OverviewReport {
  salesToday: number;
  salesMonth: number;
  salesTotal: number;
  ordersTotal: number;
  paidOrders: number;
  ordersByStatus: Record<OrderStatus, number>;
  products: number;
  activeProducts: number;
  outOfStockProducts: number;
  accounts: { total: number; available: number };
  users: number;
  averageTicket: number;
  conversion: number;
}

export type SalesPeriod = "day" | "week" | "month";

export interface SalesPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface TopCustomerRow {
  userId: string | null;
  name: string;
  orders: number;
  revenue: number;
}

export interface AdminLogEntry {
  id: string;
  adminId: string | null;
  adminUsername: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AccountSummaryRow {
  productSlug: string;
  name: string;
  total: number;
  available: number;
  used: number;
}

/* ---------- pedidos admin (Fase C) ---------- */

export interface OrderEventRow {
  id: string;
  orderId: string;
  event: string;
  actorType: string;
  actorId: string | null;
  details: string | null;
  createdAt: string;
}

export interface BatchStatusResult {
  applied: number;
  skipped: { id: string; reason: string }[];
}

export interface PaginatedOrders {
  orders: AdminOrder[];
  total: number;
  page: number;
  limit: number;
}

/* ---------- clientes e cupons admin (Fase E) ---------- */

export interface AdminUser {
  id: string;
  username: string;
  role: "user" | "admin";
  banned: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export interface PaginatedUsers {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface UserOrdersResponse {
  user: { id: string; username: string };
  orders: AdminOrder[];
}

export interface AdminCoupon {
  id: string;
  code: string;
  type: "fixed" | "percent";
  value: number;
  minValue: number;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  expiresAt: string | null;
  productSlugs: string[] | null;
  createdAt: string;
}

export interface CouponPayload {
  code: string;
  type: "fixed" | "percent";
  value: number;
  minValue?: number;
  maxUses?: number | null;
  active?: boolean;
  expiresAt?: string | null;
  productSlugs?: string[];
}

export interface ProductDto {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  oldPrice: number | null;
  categoryId: string;
  emoji: string;
  hueA: string;
  hueB: string;
  badges: string[];
  rating: number;
  reviews: number;
  /** null quando unlimitedStock=true (estoque "infinito") na serialização pública */
  stock: number | null;
  featured: boolean;
  deliveryMode: "auto" | "adm" | "manual";
  /* campos estendidos (Fase D) — opcionais, nem todo produto/preview os tem */
  sku?: string;
  tags?: string[];
  banner?: string;
  active?: boolean;
  maxQty?: number;
  unlimitedStock?: boolean;
  hideWhenZero?: boolean;
  extras?: { label: string; value: string }[];
  faq?: { q: string; a: string }[];
  garantia?: string;
  termos?: string;
  imageUrls?: string[];
}

export interface AdminProductPayload {
  name?: string;
  slug?: string;
  tagline?: string;
  description?: string;
  price?: number;
  /** `null` limpa o campo no servidor (PATCH); `undefined` mantém o valor atual. */
  oldPrice?: number | null;
  categoryId?: string;
  emoji?: string;
  hueA?: string;
  hueB?: string;
  badges?: string[];
  rating?: number;
  reviews?: number;
  stock?: number;
  featured?: boolean;
  deliveryMode?: "auto" | "adm" | "manual";
  /** `null` limpa o campo no servidor (PATCH); `undefined` mantém o valor atual. */
  sku?: string | null;
  tags?: string[];
  /** `null` limpa o campo no servidor (PATCH); `undefined` mantém o valor atual. */
  banner?: string | null;
  active?: boolean;
  /** `null` limpa o campo no servidor (PATCH); `undefined` mantém o valor atual. */
  maxQty?: number | null;
  unlimitedStock?: boolean;
  hideWhenZero?: boolean;
  extras?: { label: string; value: string }[];
  faq?: { q: string; a: string }[];
  /** `null` limpa o campo no servidor (PATCH); `undefined` mantém o valor atual. */
  garantia?: string | null;
  /** `null` limpa o campo no servidor (PATCH); `undefined` mantém o valor atual. */
  termos?: string | null;
  /** `null`/`[]` limpa as imagens; `undefined` mantém */
  imageUrls?: string[] | null;
}

/** Produto serializado pela rota admin (GET /api/admin/products).
    Inclui os campos estendidos da Fase D + active + sku (inativos vêm na lista). */
export interface AdminProduct {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  oldPrice: number | null;
  categoryId: string;
  emoji: string;
  hueA: string;
  hueB: string;
  badges: string[];
  rating: number;
  reviews: number;
  stock: number;
  deliveryMode: "auto" | "adm" | "manual";
  featured: boolean;
  sku?: string;
  tags?: string[];
  banner?: string;
  active: boolean;
  maxQty?: number;
  unlimitedStock?: boolean;
  hideWhenZero?: boolean;
  extras?: { label: string; value: string }[];
  faq?: { q: string; a: string }[];
  garantia?: string;
  termos?: string;
  imageUrls?: string[];
}

/* ---------- contas de estoque e movimentações (Fase D) ---------- */

export interface ProductAccount {
  id: string;
  productSlug?: string;
  email: string;
  password: string;
  /** Campo combinado "email:senha" (contrato Fase D) — usamos quando vier do servidor */
  emailPassword?: string;
  codigoExtra?: string | null;
  observacoes?: string | null;
  used: boolean;
  orderId?: string | null;
  createdAt: string;
}

export interface AccountImportResult {
  created: number;
  skipped: number;
  duplicates: number;
}

export interface ProductMovement {
  id: string;
  kind: "stock" | "account";
  action: string; // set | sale | refund | create | import | claim | release | ...
  qty: number;
  note: string | null;
  createdAt: string;
}

export interface AdminAlertItem {
  slug: string;
  name: string;
  emoji?: string;
  stock?: number;
  accounts?: number;
  active?: boolean;
  available?: number;
  total?: number;
}
export interface AdminAlerts {
  lowStock: AdminAlertItem[];
  outOfStock: AdminAlertItem[];
  lowAccounts: AdminAlertItem[];
  inactive: AdminAlertItem[];
}

export interface CategoryDto {
  id: string;
  name: string;
  iconKey: string;
  emoji: string;
  color: string;
  gradient: string;
  blurb: string;
}

interface ApiOptions extends RequestInit {
  token?: string | null;
}

/** Mensagem única para falhas de rede/timeout — nunca expor "Failed to fetch". */
const NETWORK_ERROR_MESSAGE = "Não foi possível conectar ao servidor. Verifique sua conexão.";

/** Tempo máximo de espera por resposta, em ms. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Fetch tipado contra a API local (base "/api"). */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, signal, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort);
  }

  let res: Response;
  try {
    const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
    res = await fetch(`${base}/api${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    // Timeout (abort) ou falha pura de rede (TypeError) — ambos viram a
    // mesma mensagem amigável, nunca o "Failed to fetch" nativo do fetch.
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!res.ok) {
    let message =
      res.status === 429
        ? "Muitas tentativas. Aguarde alguns minutos e tente novamente."
        : "Algo deu errado. Tente novamente.";
    try {
      const data = (await res.json()) as { error?: string };
      // Se o servidor mandar `error`, usa o dele (inclusive em 429).
      if (data.error) message = data.error;
    } catch {
      // corpo não-JSON — mantém mensagem padrão
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

/* ---------- helpers de catálogo admin (Fase D) ---------- */

export async function getAdminProducts(token: string): Promise<AdminProduct[]> {
  const data = await api<{ products: AdminProduct[] }>("/admin/products", { token });
  return data.products;
}

export async function createAdminProduct(token: string, payload: AdminProductPayload): Promise<ProductDto> {
  const data = await api<{ product: ProductDto }>("/products", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
  return data.product;
}

export async function updateAdminProduct(token: string, slug: string, payload: AdminProductPayload): Promise<ProductDto> {
  const data = await api<{ product: ProductDto }>(`/products/${slug}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
  return data.product;
}

export async function deleteAdminProduct(token: string, slug: string): Promise<void> {
  await api(`/products/${slug}`, { method: "DELETE", token });
}

/** Envia imagens reais de produto (multipart) e retorna as URLs salvas.
 *  NÃO usa `api()` porque ela força Content-Type JSON — aqui o body é FormData. */
export async function uploadProductImages(token: string, files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append("images", f));
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/admin/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let message = "Não foi possível enviar as imagens.";
    try {
      const d = (await res.json()) as { error?: string };
      if (d.error) message = d.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, message);
  }
  const data = (await res.json()) as { urls: string[] };
  return data.urls ?? [];
}

/* ---------- contas de estoque (Fase D) ---------- */

export async function getProductAccounts(token: string, slug: string): Promise<ProductAccount[]> {
  const data = await api<{ accounts: unknown[] }>(`/admin/products/${slug}/accounts`, { token });
  return (data.accounts ?? []).map(normalizeAccount);
}

/** Normaliza linhas cruas (snake_case, used 0/1) para o shape do frontend.
    Prioriza os campos dedicados email/password; quando o servidor manda só o
    campo combinado "email:senha" (email_password — linhas antigas), deriva os
    dois a partir dele para que todos os consumidores usem email/password. */
function normalizeAccount(raw: unknown): ProductAccount {
  const r = (raw ?? {}) as Record<string, unknown>;
  const usedRaw = r.used ?? r.used_count ?? 0;
  const combined = (r.emailPassword as string) ?? (r.email_password as string) ?? "";
  let email = String(r.email ?? "").trim();
  let password = String(r.password ?? "").trim();
  if ((!email || !password) && combined) {
    const idx = combined.indexOf(":");
    const parts = idx === -1 ? [combined, ""] : [combined.slice(0, idx), combined.slice(idx + 1)];
    email = email || (parts[0]?.trim() ?? "");
    password = password || (parts[1]?.trim() ?? "");
  }
  return {
    id: String(r.id ?? ""),
    productSlug: (r.productSlug as string) ?? (r.product_slug as string) ?? "",
    email,
    password,
    emailPassword: combined || undefined,
    codigoExtra: (r.codigoExtra as string | null | undefined) ?? (r.codigo_extra as string | null | undefined) ?? null,
    observacoes: (r.observacoes as string | null | undefined) ?? null,
    used: Boolean(usedRaw) && usedRaw !== 0 && usedRaw !== "0",
    orderId: (r.orderId as string | null | undefined) ?? (r.order_id as string | null | undefined) ?? null,
    createdAt: String(r.createdAt ?? r.created_at ?? ""),
  };
}

/** Cria uma ou mais contas (single ou bulk) para um produto. */
export async function createAccounts(token: string, slug: string, accounts: { email: string; password: string; codigoExtra?: string; observacoes?: string }[]): Promise<ProductAccount[]> {
  const data = await api<{ accounts?: unknown[]; account?: unknown; created?: number; skipped?: unknown[] }>(
    `/admin/products/${slug}/accounts`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ accounts }),
    },
  );
  return (data.accounts ?? (data.account ? [data.account] : [])).map(normalizeAccount);
}

export async function updateAccount(token: string, id: string, patch: { email?: string; password?: string; codigoExtra?: string; observacoes?: string }): Promise<ProductAccount> {
  const data = await api<{ account: ProductAccount }>(`/admin/accounts/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(patch),
  });
  return data.account;
}

export async function deleteAccounts(token: string, ids: string[]): Promise<{ deleted: number }> {
  const data = await api<{ deleted: number }>(`/admin/accounts/batch`, {
    method: "DELETE",
    token,
    body: JSON.stringify({ ids }),
  });
  return data;
}

export async function deleteAccount(token: string, id: string): Promise<void> {
  await api(`/admin/accounts/${id}`, { method: "DELETE", token });
}

export async function importAccounts(token: string, slug: string, text: string): Promise<AccountImportResult> {
  const data = await api<AccountImportResult>(`/admin/products/${slug}/accounts/import`, {
    method: "POST",
    token,
    body: JSON.stringify({ text }),
  });
  return data;
}

/** URL (relativa ao /api) do TXT de exportação de contas. */
export function exportAccountsPath(slug: string): string {
  return `/admin/products/${slug}/accounts/export`;
}

/** Baixa o TXT de contas de um produto e dispara o download. */
export async function exportAccounts(token: string, slug: string): Promise<void> {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/admin/products/${slug}/accounts/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let message = "Não foi possível exportar as contas.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* corpo não-JSON — mantém a mensagem padrão */
    }
    throw new ApiError(res.status, message);
  }
  const text = await res.text();
  if (text.trim().length === 0) {
    throw new ApiError(0, "Nenhuma conta para exportar.");
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-contas.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- movimentações e alertas (Fase D) ---------- */

export async function getProductMovements(token: string, slug: string): Promise<ProductMovement[]> {
  const data = await api<{ movements: ProductMovement[] }>(`/admin/products/${slug}/movements`, { token });
  return data.movements;
}

export async function getAdminAlerts(token: string): Promise<AdminAlerts> {
  const data = await api<{ alerts: AdminAlerts }>("/admin/alerts", { token });
  return data.alerts;
}
