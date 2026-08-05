import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase-client";

/* ============================================================
   DB — Supabase (PostgreSQL) — substitui o SQLite local.
   Todas as funções são ASSÍNCRONAS (await required).
   Transações complexas usam RPCs SQL já definidas no Supabase.
   ============================================================ */

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/* ---------- auth helpers ---------- */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;

/** Gera "salt:hash" com scrypt ASSÍNCRONO. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `${salt}:${derived.toString("hex")}`;
}

/** Comparação em tempo constante. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const candidate = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(candidate, expected);
}

export const DUMMY_PASSWORD_HASH = await hashPassword("timing-guard-dummy");

/* ---------- types ---------- */

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  avatar: string;
  role: "user" | "admin";
  banned?: number;
  created_at: string;
}

export interface SessionRow {
  token: string;
  user_id: string;
  expires_at: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  icon_key: string;
  emoji: string;
  color: string;
  gradient: string;
  blurb: string;
}

export interface ProductRow {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  old_price: number | null;
  category_id: string;
  emoji: string;
  hue_a: string;
  hue_b: string;
  badges: string;
  rating: number;
  reviews: number;
  stock: number;
  featured: number;
  delivery_mode: "auto" | "adm" | "manual";
  sku: string | null;
  tags: string;
  banner: string | null;
  active: number;
  max_qty: number | null;
  unlimited_stock: number;
  hide_when_zero: number;
  extras: string;
  faq: string;
  garantia: string | null;
  termos: string | null;
  image_urls: string | null;
}

export interface OrderRow {
  id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_cep: string;
  shipping_street: string;
  shipping_number: string;
  shipping_complement: string | null;
  shipping_city: string;
  shipping_state: string;
  card_last4: string;
  items_json: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  status: string;
  delivery_json: string | null;
  processed_at: string | null;
  created_at: string;
  payment_id: string | null;
  payment_provider: string;
  payment_status: string | null;
  delivery_mode: string | null;
  needs_manual: number;
  payment_expires_at: number | null;
  stock_decrement_json: string | null;
  coupon_code: string | null;
  discount_amount: number;
}

export interface AccountRow {
  id: string;
  product_slug: string;
  email: string;
  password: string;
  email_password: string | null;
  codigo_extra: string | null;
  observacoes: string | null;
  used: number;
  order_id: string | null;
  created_at: string;
}

export interface CouponRow {
  id: string;
  code: string;
  type: "fixed" | "percent";
  value: number;
  min_value: number;
  max_uses: number | null;
  uses_count: number;
  active: number;
  expires_at: string | null;
  product_slugs: string | null;
  created_at: string;
}

export interface ActivityLogRow {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  ip: string | null;
  created_at: string;
}

export interface OrderEventRow {
  id: string;
  order_id: string;
  event: string;
  actor_type: string;
  actor_id: string | null;
  details: string | null;
  created_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export type MovementKind = "stock" | "account";

export interface ProductMovementRow {
  id: string;
  product_slug: string;
  kind: MovementKind;
  action: string;
  qty: number | null;
  note: string | null;
  created_at: string;
}

export interface AccountCountByProduct {
  productSlug: string;
  total: number;
  available: number;
  used: number;
}

export interface StockAlerts {
  lowStock: Array<{ slug: string; name: string; stock: number }>;
  outOfStock: Array<{ slug: string; name: string }>;
  lowAccounts: Array<{ slug: string; name: string; available: number; total: number }>;
  inactive: Array<{ slug: string; name: string }>;
}

export interface UserAggRow {
  id: string;
  username: string;
  role: string;
  banned: number;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export interface UserListOptions {
  q?: string;
  page?: number;
  limit?: number;
  sort?: "asc" | "desc";
}

export interface OverviewReport {
  salesToday: number;
  salesMonth: number;
  salesTotal: number;
  ordersTotal: number;
  paidOrders: number;
  ordersByStatus: Record<string, number>;
  products: number;
  activeProducts: number;
  outOfStockProducts: number;
  accounts: { total: number; available: number };
  users: number;
  averageTicket: number;
  conversion: number;
}

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

export interface CouponEvaluation {
  valid: boolean;
  message?: string;
  discount: number;
  type: string;
  value: number;
  coupon?: CouponRow;
}

/* ============================================================
   USERS
   ============================================================ */

export async function findUserByUsername(username: string): Promise<UserRow | undefined> {
  const { data, error } = await supabase.from("users").select("*").eq("username", username).single();
  if (error || !data) return undefined;
  return data as UserRow;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).single();
  if (error || !data) return undefined;
  return data as UserRow;
}

export async function createUser(row: Omit<UserRow, "created_at">): Promise<void> {
  const { error } = await supabase.from("users").insert({
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    avatar: row.avatar,
    role: row.role,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updateUser(id: string, username: string, avatar: string): Promise<void> {
  const { error } = await supabase.from("users").update({ username, avatar }).eq("id", id);
  if (error) throw error;
}

export async function updatePassword(id: string, passwordHash: string): Promise<void> {
  const { error } = await supabase.from("users").update({ password_hash: passwordHash }).eq("id", id);
  if (error) throw error;
}

export async function updateUserRole(id: string, role: "user" | "admin"): Promise<void> {
  const { error } = await supabase.from("users").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function updateUserBanned(id: string, banned: boolean): Promise<void> {
  const { error } = await supabase.from("users").update({ banned: banned ? 1 : 0 }).eq("id", id);
  if (error) throw error;
}

export async function countAdmins(): Promise<number> {
  const { count, error } = await supabase.from("users").select("*", { count: "exact", head: true }).eq("role", "admin");
  if (error) return 0;
  return count ?? 0;
}

export async function listUsers(opts: UserListOptions = {}): Promise<{
  items: UserAggRow[];
  total: number;
  page: number;
  limit: number;
}> {
  const q = (opts.q ?? "").trim();
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const limit = Math.min(500, Math.max(1, Math.floor(opts.limit ?? 50)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from("users").select("*", { count: "exact" });
  if (q) query = query.ilike("username", `%${q}%`);
  query = query.order("created_at", { ascending: opts.sort === "asc" }).range(from, to);

  const { data: users, count: total, error } = await query;
  if (error || !users) return { items: [], total: 0, page, limit };

  const items: UserAggRow[] = [];
  for (const u of users) {
    const { count: orderCount } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    const { data: paidOrders } = await supabase.from("orders").select("total").eq("user_id", u.id).in("status", ["approved", "delivered"]);
    const totalSpent = paidOrders ? paidOrders.reduce((s: number, o: any) => s + (o.total ?? 0), 0) : 0;
    const { data: lastOrder } = await supabase.from("orders").select("created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(1).single();
    items.push({
      id: u.id,
      username: u.username,
      role: u.role,
      banned: u.banned ?? 0,
      createdAt: u.created_at,
      orderCount: orderCount ?? 0,
      totalSpent: Math.round(totalSpent * 100) / 100,
      lastOrderAt: lastOrder?.created_at ?? null,
    });
  }

  return { items, total: total ?? 0, page, limit };
}

export async function listUserOrders(userId: string): Promise<OrderRow[]> {
  const { data, error } = await supabase.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as OrderRow[];
}

/* ============================================================
   SESSIONS
   ============================================================ */

export async function createSession(token: string, userId: string, expiresAt: number): Promise<void> {
  const { error } = await supabase.from("sessions").insert({ token, user_id: userId, expires_at: expiresAt });
  if (error) throw error;
}

export async function findSession(token: string): Promise<{ user_id: string; expires_at: number } | undefined> {
  const { data, error } = await supabase.from("sessions").select("user_id, expires_at").eq("token", token).single();
  if (error || !data) return undefined;
  return { user_id: data.user_id, expires_at: data.expires_at };
}

export async function deleteSession(token: string): Promise<void> {
  await supabase.from("sessions").delete().eq("token", token);
}

export async function pruneExpiredSessions(now: number = Date.now()): Promise<void> {
  await supabase.from("sessions").delete().lt("expires_at", now);
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await supabase.from("sessions").delete().eq("user_id", userId);
}

export async function deleteSessionsForUserExcept(userId: string, keepToken: string): Promise<void> {
  await supabase.from("sessions").delete().eq("user_id", userId).neq("token", keepToken);
}

/* ============================================================
   CATEGORIES
   ============================================================ */

export async function listCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error || !data) return [];
  return data as CategoryRow[];
}

export async function getCategoryById(id: string): Promise<CategoryRow | undefined> {
  const { data, error } = await supabase.from("categories").select("*").eq("id", id).single();
  if (error || !data) return undefined;
  return data as CategoryRow;
}

export async function insertCategory(row: CategoryRow): Promise<void> {
  const { error } = await supabase.from("categories").insert(row);
  if (error) throw error;
}

export async function updateCategory(id: string, row: CategoryRow): Promise<void> {
  const { error } = await supabase.from("categories").update({ name: row.name, icon_key: row.icon_key, emoji: row.emoji, color: row.color, gradient: row.gradient, blurb: row.blurb }).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  await supabase.from("categories").delete().eq("id", id);
}

/* ============================================================
   PRODUCTS
   ============================================================ */

export async function listProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase.from("products").select("*").order("featured", { ascending: false }).order("name");
  if (error || !data) return [];
  // Converter JSONB fields para strings (compatibilidade com o código existente)
  return data.map((p: any) => ({
    ...p,
    badges: typeof p.badges === "string" ? p.badges : JSON.stringify(p.badges ?? []),
    tags: typeof p.tags === "string" ? p.tags : JSON.stringify(p.tags ?? []),
    extras: typeof p.extras === "string" ? p.extras : JSON.stringify(p.extras ?? []),
    faq: typeof p.faq === "string" ? p.faq : JSON.stringify(p.faq ?? []),
    image_urls: p.image_urls ? (typeof p.image_urls === "string" ? p.image_urls : JSON.stringify(p.image_urls)) : null,
  })) as ProductRow[];
}

export async function getProductBySlug(slug: string): Promise<ProductRow | undefined> {
  const { data, error } = await supabase.from("products").select("*").eq("slug", slug).single();
  if (error || !data) return undefined;
  const p = data as any;
  return {
    ...p,
    badges: typeof p.badges === "string" ? p.badges : JSON.stringify(p.badges ?? []),
    tags: typeof p.tags === "string" ? p.tags : JSON.stringify(p.tags ?? []),
    extras: typeof p.extras === "string" ? p.extras : JSON.stringify(p.extras ?? []),
    faq: typeof p.faq === "string" ? p.faq : JSON.stringify(p.faq ?? []),
    image_urls: p.image_urls ? (typeof p.image_urls === "string" ? p.image_urls : JSON.stringify(p.image_urls)) : null,
  } as ProductRow;
}

/** Decrementa o estoque de um produto em 1 unidade (atômico via RPC).
 *  Retorna true se conseguiu (havia estoque disponível). */
export async function decrementStock(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("decrement_stock", { p_slug: slug });
  if (error) return false;
  return Boolean(data);
}

/** Restaura o estoque de um produto em `qty` unidades (via RPC). */
export async function restoreStock(slug: string, qty: number): Promise<void> {
  const { error } = await supabase.rpc("restore_stock", { p_slug: slug, p_qty: qty });
  if (error) throw error;
}

export async function insertProduct(row: ProductRow): Promise<void> {
  const { error } = await supabase.from("products").insert({
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    price: row.price,
    old_price: row.old_price,
    category_id: row.category_id,
    emoji: row.emoji,
    hue_a: row.hue_a,
    hue_b: row.hue_b,
    badges: row.badges,
    rating: row.rating,
    reviews: row.reviews,
    stock: row.stock,
    featured: row.featured,
    delivery_mode: row.delivery_mode,
    sku: row.sku,
    tags: row.tags,
    banner: row.banner,
    active: row.active,
    max_qty: row.max_qty,
    unlimited_stock: row.unlimited_stock,
    hide_when_zero: row.hide_when_zero,
    extras: row.extras,
    faq: row.faq,
    garantia: row.garantia,
    termos: row.termos,
    image_urls: row.image_urls,
  });
  if (error) throw error;
}

export async function updateProduct(slug: string, row: ProductRow): Promise<void> {
  const { error } = await supabase.from("products").update({
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    price: row.price,
    old_price: row.old_price,
    category_id: row.category_id,
    emoji: row.emoji,
    hue_a: row.hue_a,
    hue_b: row.hue_b,
    badges: row.badges,
    rating: row.rating,
    reviews: row.reviews,
    stock: row.stock,
    featured: row.featured,
    delivery_mode: row.delivery_mode,
    sku: row.sku,
    tags: row.tags,
    banner: row.banner,
    active: row.active,
    max_qty: row.max_qty,
    unlimited_stock: row.unlimited_stock,
    hide_when_zero: row.hide_when_zero,
    extras: row.extras,
    faq: row.faq,
    garantia: row.garantia,
    termos: row.termos,
    image_urls: row.image_urls,
  }).eq("slug", slug);
  if (error) throw error;
}

export async function deleteProduct(slug: string): Promise<void> {
  await supabase.from("products").delete().eq("slug", slug);
}

/* ============================================================
   ORDERS
   ============================================================ */

export async function insertOrder(row: {
  id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_cep: string;
  shipping_street: string;
  shipping_number: string;
  shipping_complement: string | null;
  shipping_city: string;
  shipping_state: string;
  card_last4: string;
  items_json: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  status: string;
  payment_id: string | null;
  payment_provider: string;
  payment_status: string;
  delivery_mode: string;
  needs_manual: number;
  payment_expires_at: number | null;
  stock_decrement_json: string | null;
  coupon_code: string | null;
  discount_amount: number;
}): Promise<void> {
  const { error } = await supabase.from("orders").insert({
    ...row,
    items_json: row.items_json,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getOrderById(id: string): Promise<OrderRow | undefined> {
  const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();
  if (error || !data) return undefined;
  return data as OrderRow;
}

export async function updateOrderStatus(id: string, status: string, deliveryJson: string | null = null): Promise<void> {
  const update: Record<string, any> = { status };
  if (deliveryJson !== null) update.delivery_json = deliveryJson;
  if (status === "approved" || status === "delivered") update.processed_at = new Date().toISOString();
  const { error } = await supabase.from("orders").update(update).eq("id", id);
  if (error) throw error;
}

export async function updatePaymentStatus(id: string, paymentStatus: string): Promise<void> {
  const { error } = await supabase.from("orders").update({ payment_status: paymentStatus }).eq("id", id);
  if (error) throw error;
}

export async function updateOrderStockDecrement(id: string, stockDecrementJson: string): Promise<void> {
  const { error } = await supabase.from("orders").update({ stock_decrement_json: stockDecrementJson }).eq("id", id);
  if (error) throw error;
}

export async function setOrderNeedsManual(id: string, value: number): Promise<void> {
  const { error } = await supabase.from("orders").update({ needs_manual: value }).eq("id", id);
  if (error) throw error;
}

export async function updateOrderPayment(id: string, opts: {
  paymentId?: string | null;
  provider?: string;
  status?: string;
  expiresAt?: number | null;
}): Promise<void> {
  const update: Record<string, any> = {};
  if (opts.paymentId !== undefined) update.payment_id = opts.paymentId;
  if (opts.provider !== undefined) update.payment_provider = opts.provider;
  if (opts.status !== undefined) update.payment_status = opts.status;
  if (opts.expiresAt !== undefined) update.payment_expires_at = opts.expiresAt;
  const { error } = await supabase.from("orders").update(update).eq("id", id);
  if (error) throw error;
}

export async function listOrders(opts: {
  userId?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ items: OrderRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(500, opts.limit ?? 50);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from("orders").select("*", { count: "exact" });
  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.status) query = query.eq("status", opts.status);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) return { items: [], total: 0 };
  return { items: (data ?? []) as OrderRow[], total: count ?? 0 };
}

/* ============================================================
   PROCESSED PAYMENTS (idempotência)
   ============================================================ */

export async function insertProcessedPayment(paymentId: string, orderId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc("insert_processed_payment", {
    p_payment_id: paymentId,
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
}

export async function isPaymentProcessed(paymentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_payment_processed", { p_payment_id: paymentId });
  if (error) return false;
  return Boolean(data);
}

/* ============================================================
   ACCOUNTS (auto-delivery)
   ============================================================ */

export async function insertAccount(row: AccountRow): Promise<void> {
  const { error } = await supabase.from("accounts").insert(row);
  if (error) throw error;
}

export async function getAccountById(id: string): Promise<AccountRow | undefined> {
  const { data, error } = await supabase.from("accounts").select("*").eq("id", id).single();
  if (error || !data) return undefined;
  return data as AccountRow;
}

export async function deleteAccount(id: string): Promise<void> {
  await supabase.from("accounts").delete().eq("id", id);
}

export async function listAccountsByProduct(productSlug: string): Promise<AccountRow[]> {
  const { data, error } = await supabase.from("accounts").select("*").eq("product_slug", productSlug).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as AccountRow[];
}

export async function listAvailableAccounts(productSlug: string): Promise<AccountRow[]> {
  const { data, error } = await supabase.from("accounts").select("*").eq("product_slug", productSlug).eq("used", 0).is("order_id", null).order("created_at");
  if (error || !data) return [];
  return data as AccountRow[];
}

export async function countAvailableAccounts(productSlug: string): Promise<number> {
  const { count, error } = await supabase.from("accounts").select("*", { count: "exact", head: true }).eq("product_slug", productSlug).eq("used", 0).is("order_id", null);
  if (error) return 0;
  return count ?? 0;
}

/** Claim atômico via RPC (garantido pelo banco). */
export async function claimAccount(productSlug: string, orderId: string): Promise<AccountRow | undefined> {
  const { data, error } = await supabase.rpc("claim_account", {
    p_product_slug: productSlug,
    p_order_id: orderId,
  });
  if (error || !data) return undefined;
  // data é um array com 0 ou 1 resultado
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return undefined;
  return row as AccountRow;
}

/** Devolve ao estoque todas as contas claimadas por um pedido (via RPC).
 *  Retorna os product_slug das contas liberadas. */
export async function releaseAccountsByOrder(orderId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("release_accounts_by_order", { p_order_id: orderId });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r: any) => r?.product_slug).filter(Boolean);
}

export async function updateAccount(
  id: string,
  row: Pick<AccountRow, "email" | "password" | "email_password" | "codigo_extra" | "observacoes">,
): Promise<void> {
  const { error } = await supabase.from("accounts").update({
    email: row.email,
    password: row.password,
    email_password: row.email_password,
    codigo_extra: row.codigo_extra,
    observacoes: row.observacoes,
  }).eq("id", id);
  if (error) throw error;
}

export async function accountCountsByProduct(): Promise<AccountCountByProduct[]> {
  const { data, error } = await supabase.from("accounts").select("product_slug, used");
  if (error || !data) return [];
  const map = new Map<string, AccountCountByProduct>();
  for (const a of data as any[]) {
    let entry = map.get(a.product_slug);
    if (!entry) {
      entry = { productSlug: a.product_slug, total: 0, available: 0, used: 0 };
      map.set(a.product_slug, entry);
    }
    entry.total++;
    if (a.used === 0) entry.available++;
    else entry.used++;
  }
  return [...map.values()].sort((a, b) => a.productSlug.localeCompare(b.productSlug));
}

/* ============================================================
   PRODUCT MOVEMENTS (ledger)
   ============================================================ */

export async function logMovement(opts: {
  productSlug: string;
  kind: MovementKind;
  action: string;
  qty?: number | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("log_movement", {
    p_product_slug: opts.productSlug,
    p_kind: opts.kind,
    p_action: opts.action,
    p_qty: opts.qty ?? null,
    p_note: opts.note ?? null,
  });
  if (error) throw error;
}

export async function listMovements(productSlug: string, limit = 100): Promise<ProductMovementRow[]> {
  const { data, error } = await supabase.from("product_movements").select("*").eq("product_slug", productSlug).order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data as ProductMovementRow[];
}

/* ============================================================
   COUPONS
   ============================================================ */

export async function listCoupons(): Promise<CouponRow[]> {
  const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map(c => ({
    ...c,
    product_slugs: typeof c.product_slugs === "string" ? c.product_slugs : JSON.stringify(c.product_slugs),
  })) as CouponRow[];
}

export async function getCouponById(id: string): Promise<CouponRow | undefined> {
  const { data, error } = await supabase.from("coupons").select("*").eq("id", id).single();
  if (error || !data) return undefined;
  const c = data as any;
  return { ...c, product_slugs: typeof c.product_slugs === "string" ? c.product_slugs : JSON.stringify(c.product_slugs) } as CouponRow;
}

export async function getCouponByCode(code: string): Promise<CouponRow | undefined> {
  const { data, error } = await supabase.from("coupons").select("*").eq("code", String(code ?? "").trim().toUpperCase()).single();
  if (error || !data) return undefined;
  const c = data as any;
  return { ...c, product_slugs: typeof c.product_slugs === "string" ? c.product_slugs : JSON.stringify(c.product_slugs) } as CouponRow;
}

export async function insertCoupon(row: Omit<CouponRow, "created_at">): Promise<void> {
  const { error } = await supabase.from("coupons").insert({
    ...row,
    product_slugs: row.product_slugs,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updateCoupon(id: string, row: CouponRow): Promise<void> {
  const { error } = await supabase.from("coupons").update({
    code: row.code,
    type: row.type,
    value: row.value,
    min_value: row.min_value,
    max_uses: row.max_uses,
    uses_count: row.uses_count,
    active: row.active,
    expires_at: row.expires_at,
    product_slugs: row.product_slugs,
  }).eq("id", id);
  if (error) throw error;
}

export async function deleteCoupon(id: string): Promise<void> {
  await supabase.from("coupons").delete().eq("id", id);
}

export async function incrementCouponUses(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("increment_coupon_uses", { p_coupon_id: id });
  if (error) return false;
  return Boolean(data);
}

/** Decrementa o uso de um cupom pelo código (via RPC, nunca abaixo de 0). */
export async function decrementCouponUses(code: string): Promise<void> {
  const { error } = await supabase.rpc("decrement_coupon_uses", { p_code: code });
  if (error) throw error;
}

export async function setOrderCoupon(id: string, code: string | null, discount: number): Promise<void> {
  const { error } = await supabase.from("orders").update({ coupon_code: code, discount_amount: discount }).eq("id", id);
  if (error) throw error;
}

export async function evaluateCoupon(
  code: string,
  subtotal: number,
  productSlugs: string[],
): Promise<CouponEvaluation> {
  const coupon = await getCouponByCode(code);
  if (!coupon) return { valid: false, message: "Cupom não encontrado.", discount: 0, type: "", value: 0 };
  if (!coupon.active) return { valid: false, message: "Cupom inativo.", discount: 0, type: coupon.type, value: coupon.value };
  if (coupon.expires_at) {
    const expiry = new Date(coupon.expires_at).getTime();
    if (!Number.isNaN(expiry) && expiry < Date.now()) return { valid: false, message: "Cupom expirado.", discount: 0, type: coupon.type, value: coupon.value };
  }
  if (coupon.max_uses !== null && coupon.max_uses !== undefined && coupon.uses_count >= coupon.max_uses) {
    return { valid: false, message: "Cupom atingiu o limite de usos.", discount: 0, type: coupon.type, value: coupon.value };
  }
  if (subtotal < coupon.min_value) {
    return { valid: false, message: `Valor mínimo de R$ ${coupon.min_value.toFixed(2)} não atingido.`, discount: 0, type: coupon.type, value: coupon.value };
  }
  if (coupon.product_slugs) {
    let allowed: string[] = [];
    try { allowed = JSON.parse(coupon.product_slugs); } catch { allowed = []; }
    if (Array.isArray(allowed) && allowed.length > 0) {
      if (!productSlugs.every((s) => allowed.includes(s))) {
        return { valid: false, message: "Cupom não se aplica a todos os produtos deste carrinho.", discount: 0, type: coupon.type, value: coupon.value };
      }
    }
  }
  let discount = coupon.type === "percent" ? (subtotal * coupon.value) / 100 : coupon.value;
  discount = Math.min(discount, subtotal);
  discount = Math.round(discount * 100) / 100;
  return { valid: true, discount, type: coupon.type, value: coupon.value, coupon };
}

/* ============================================================
   SUBSCRIBERS
   ============================================================ */

export async function addSubscriber(email: string, subscribedAt: string): Promise<void> {
  const { error } = await supabase.from("subscribers").upsert({ email, subscribed_at: subscribedAt }, { onConflict: "email" });
  if (error) throw error;
}

/* ============================================================
   ACTIVITY LOGS
   ============================================================ */

export async function insertActivityLog(row: Omit<ActivityLogRow, "created_at"> & { created_at?: string }): Promise<void> {
  const { error } = await supabase.from("activity_logs").insert({
    id: row.id,
    admin_id: row.admin_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details: row.details,
    ip: row.ip,
    created_at: row.created_at ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export async function listActivityLogs(opts: {
  page?: number;
  limit?: number;
  action?: string;
}): Promise<{ items: ActivityLogRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(500, opts.limit ?? 50);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from("activity_logs").select("*", { count: "exact" });
  if (opts.action) query = query.eq("action", opts.action);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) return { items: [], total: 0, page, limit };
  return { items: (data ?? []) as ActivityLogRow[], total: count ?? 0, page, limit };
}

/* ============================================================
   SETTINGS
   ============================================================ */

export async function getAllSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const r of data as any[]) out[r.key] = r.value;
  return out;
}

export async function setSettings(entries: Record<string, unknown>): Promise<Record<string, string>> {
  const now = new Date().toISOString();
  const rows = Object.entries(entries).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
    updated_at: now,
  }));
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) throw error;
  return getAllSettings();
}

/* ============================================================
   ORDER EVENTS (timeline)
   ============================================================ */

export async function insertOrderEvent(e: {
  orderId: string;
  event: string;
  actorType: string;
  actorId?: string | null;
  details?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("insert_order_event", {
    p_order_id: e.orderId,
    p_event: e.event,
    p_actor_type: e.actorType,
    p_actor_id: e.actorId ?? null,
    p_details: e.details ? e.details : null,
  });
  if (error) throw error;
}

export async function listOrderEvents(orderId: string): Promise<OrderEventRow[]> {
  const { data, error } = await supabase.from("order_events").select("*").eq("order_id", orderId).order("created_at");
  if (error || !data) return [];
  return data as OrderEventRow[];
}

/* ============================================================
   STOCK ALERTS
   ============================================================ */

export async function getStockAlerts(threshold: number): Promise<StockAlerts> {
  const { data: products, error } = await supabase.from("products").select("slug, name, stock, active, unlimited_stock, delivery_mode").order("name");
  if (error || !products) return { lowStock: [], outOfStock: [], lowAccounts: [], inactive: [] };

  const counts = await accountCountsByProduct();
  const countsBySlug = new Map(counts.map((c) => [c.productSlug, c]));

  const lowStock: StockAlerts["lowStock"] = [];
  const outOfStock: StockAlerts["outOfStock"] = [];
  const lowAccounts: StockAlerts["lowAccounts"] = [];
  const inactive: StockAlerts["inactive"] = [];

  for (const p of products as any[]) {
    if (!p.active) { inactive.push({ slug: p.slug, name: p.name }); continue; }
    if (!p.unlimited_stock && p.delivery_mode !== "auto" && p.delivery_mode !== "adm") {
      if (p.stock <= 0) outOfStock.push({ slug: p.slug, name: p.name });
      else if (p.stock <= threshold) lowStock.push({ slug: p.slug, name: p.name, stock: p.stock });
    }
    if (p.delivery_mode === "auto" || p.delivery_mode === "adm") {
      const c = countsBySlug.get(p.slug);
      const available = c?.available ?? 0;
      const total = c?.total ?? 0;
      if (available <= threshold) lowAccounts.push({ slug: p.slug, name: p.name, available, total });
    }
  }
  return { lowStock, outOfStock, lowAccounts, inactive };
}

/* ============================================================
   REPORTS
   ============================================================ */

const PAID_STATUS = ["approved", "delivered"];

export async function getReportsOverview(): Promise<OverviewReport> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const sumPaid = async (since?: string) => {
    let q = supabase.from("orders").select("total").in("status", PAID_STATUS);
    if (since) q = q.gte("created_at", since);
    const { data } = await q;
    return data ? Math.round(data.reduce((s: number, o: any) => s + (o.total ?? 0), 0) * 100) / 100 : 0;
  };

  const salesToday = await sumPaid(todayStart);
  const salesMonth = await sumPaid(monthStart);
  const salesTotal = await sumPaid();

  const { count: ordersTotal } = await supabase.from("orders").select("*", { count: "exact", head: true });
  const { count: paidOrders } = await supabase.from("orders").select("*", { count: "exact", head: true }).in("status", PAID_STATUS);
  const { count: products } = await supabase.from("products").select("*", { count: "exact", head: true });
  const { count: activeProducts } = await supabase.from("products").select("*", { count: "exact", head: true }).gt("stock", 0);
  const { count: accountsTotal } = await supabase.from("accounts").select("*", { count: "exact", head: true });
  const { count: accountsAvailable } = await supabase.from("accounts").select("*", { count: "exact", head: true }).eq("used", 0);
  const { count: users } = await supabase.from("users").select("*", { count: "exact", head: true }).eq("role", "user");

  const { data: statusRows } = await supabase.from("orders").select("status");
  const ordersByStatus: Record<string, number> = { pending: 0, approved: 0, delivered: 0, cancelled: 0 };
  for (const r of (statusRows ?? []) as any[]) ordersByStatus[r.status] = (ordersByStatus[r.status] ?? 0) + 1;

  const p = paidOrders ?? 0;
  return {
    salesToday, salesMonth, salesTotal,
    ordersTotal: ordersTotal ?? 0, paidOrders: p, ordersByStatus,
    products: products ?? 0, activeProducts: activeProducts ?? 0,
    outOfStockProducts: (products ?? 0) - (activeProducts ?? 0),
    accounts: { total: accountsTotal ?? 0, available: accountsAvailable ?? 0 },
    users: users ?? 0,
    averageTicket: p > 0 ? Math.round((salesTotal / p) * 100) / 100 : 0,
    conversion: (ordersTotal ?? 0) > 0 ? Math.round((p / (ordersTotal ?? 1)) * 10000) / 100 : 0,
  };
}

export async function getSalesSeries(period: "day" | "week" | "month"): Promise<SalesPoint[]> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoDayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isoWeekStart = (d: Date) => {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (out.getDay() + 6) % 7;
    out.setDate(out.getDate() - dow);
    return out;
  };
  const isoWeekKeyStr = (d: Date) => isoDayKey(isoWeekStart(d));
  const isoMonthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const addDays = (d: Date, days: number) => { const r = new Date(d); r.setDate(r.getDate() + days); return r; };

  const keyFn = period === "day" ? isoDayKey : period === "week" ? isoWeekKeyStr : isoMonthKey;
  const labelFn = period === "day"
    ? (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
    : period === "week"
      ? (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
      : (d: Date) => `${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  const since = period === "day"
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13)
    : period === "week"
      ? addDays(isoWeekStart(now), -7 * 7)
      : new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const buckets = new Map<string, SalesPoint>();
  const orderList: Date[] = [];
  if (period === "day") {
    for (let i = 0; i < 14; i++) orderList.push(addDays(isoDayKey(now) as any, -13 + i));
  } else if (period === "week") {
    const start = isoWeekStart(now);
    for (let i = 7; i >= 0; i--) orderList.push(addDays(start, -i * 7));
  } else {
    const startY = since.getFullYear();
    const startM = since.getMonth();
    for (let i = 0; i < 6; i++) orderList.push(new Date(startY, startM + i, 1));
  }
  for (const d of orderList) buckets.set(keyFn(d), { label: labelFn(d), revenue: 0, orders: 0 });

  const { data } = await supabase.from("orders").select("created_at, total").in("status", PAID_STATUS).gte("created_at", since.toISOString());
  for (const r of (data ?? []) as any[]) {
    const key = keyFn(new Date(r.created_at));
    const b = buckets.get(key);
    if (b) { b.revenue += r.total; b.orders++; }
  }

  const out = [...buckets.values()];
  for (const p of out) p.revenue = Math.round(p.revenue * 100) / 100;
  return out;
}

export async function getTopProducts(limit: number): Promise<TopProductRow[]> {
  const { data } = await supabase.from("orders").select("items_json").in("status", PAID_STATUS);
  const agg = new Map<string, { name: string; quantity: number; revenue: number }>();
  const productCache = new Map<string, ProductRow | undefined>();
  const productOf = async (slug: string) => {
    if (!productCache.has(slug)) productCache.set(slug, await getProductBySlug(slug));
    return productCache.get(slug);
  };

  for (const r of (data ?? []) as any[]) {
    let items: unknown[] = [];
    try { items = JSON.parse(r.items_json || "[]"); } catch { continue; }
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const it = (raw ?? {}) as any;
      const productId = String(it.productId ?? "");
      if (!productId) continue;
      const qty = Math.max(1, Math.floor(Number(it.qty)) || 1);
      const product = await productOf(productId);
      const price = typeof it.price === "number" ? it.price : (product?.price ?? 0);
      const entry = agg.get(productId) ?? { name: product?.name ?? (typeof it.name === "string" ? it.name : productId), quantity: 0, revenue: 0 };
      entry.quantity += qty;
      entry.revenue += qty * price;
      agg.set(productId, entry);
    }
  }

  return [...agg.entries()]
    .map(([productId, e]) => ({ productId, name: e.name, quantity: e.quantity, revenue: Math.round(e.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
    .slice(0, limit);
}

export async function getTopCustomers(limit: number): Promise<TopCustomerRow[]> {
  const { data } = await supabase.from("orders").select("user_id, customer_name, customer_email, total").in("status", PAID_STATUS);
  const buckets = new Map<string, { userId: string | null; name: string; orders: number; revenue: number }>();

  for (const r of (data ?? []) as any[]) {
    const key = r.user_id ? `u:${r.user_id}` : `c:${r.customer_name}:${r.customer_email}`;
    const entry = buckets.get(key) ?? { userId: r.user_id, name: r.customer_name, orders: 0, revenue: 0 };
    entry.orders++;
    entry.revenue += r.total;
    buckets.set(key, entry);
  }

  return [...buckets.values()]
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
    .slice(0, limit)
    .map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }));
}

/* ============================================================
   SEED (admin + catálogo)
   ============================================================ */

const ICON_BY_CATEGORY: Record<string, string> = {
  netflix: "Play", amazon: "Package", spotify: "Music2", disney: "Sparkles",
  hbomax: "Clapperboard", youtube: "Video", crunchyroll: "Gamepad2",
};

interface SeedCategory { id: string; name: string; emoji: string; color: string; gradient: string; blurb: string; }
interface SeedProduct { slug: string; name: string; tagline: string; description: string; price: number; oldPrice?: number; categoryId: string; emoji: string; hueA: string; hueB: string; badges: string[]; rating: number; reviews: number; stock: number; featured: boolean; }

function readSeed<T>(file: string): T[] {
  try {
    const raw = readFileSync(join(__dirname, "..", "src", "lib", "db", "seed", file), "utf8");
    return JSON.parse(raw) as T[];
  } catch { return []; }
}

export async function seedCatalog(): Promise<void> {
  const { count: catCount } = await supabase.from("categories").select("*", { count: "exact", head: true });
  if ((catCount ?? 0) === 0) {
    const seeds = readSeed<SeedCategory>("categories.json");
    for (const c of seeds) {
      await insertCategory({ id: c.id, name: c.name, icon_key: ICON_BY_CATEGORY[c.id] ?? "Puzzle", emoji: c.emoji, color: c.color, gradient: c.gradient, blurb: c.blurb });
    }
  }

  const { count: prodCount } = await supabase.from("products").select("*", { count: "exact", head: true });
  if ((prodCount ?? 0) === 0) {
    const seeds = readSeed<SeedProduct>("products.json");
    for (const p of seeds) {
      await insertProduct({
        slug: p.slug, name: p.name, tagline: p.tagline, description: p.description,
        price: p.price, old_price: p.oldPrice ?? null, category_id: p.categoryId,
        emoji: p.emoji, hue_a: p.hueA, hue_b: p.hueB, badges: JSON.stringify(p.badges),
        rating: p.rating, reviews: p.reviews, stock: p.stock, featured: p.featured ? 1 : 0,
        delivery_mode: "manual", sku: null, tags: "[]", banner: null, active: 1, max_qty: null,
        unlimited_stock: 0, hide_when_zero: 0, extras: "[]", faq: "[]", garantia: null, termos: null,
      });
    }
  }
}

export async function seedAdmin(): Promise<false | string> {
  const existing = await findUserByUsername("admin");
  if (existing) return false;

  const envPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
  const password = envPassword || randomBytes(4).toString("hex");
  await createUser({
    id: "usr_admin",
    username: "admin",
    password_hash: await hashPassword(password),
    avatar: "🦉",
    role: "admin",
  });
  if (!envPassword) console.log(`[seed] Admin criado — user: admin / senha: ${password}`);
  return password;
}
