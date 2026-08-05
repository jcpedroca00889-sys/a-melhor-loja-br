import express, { type NextFunction, type Request, type Response } from "express";
import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import {
  DUMMY_PASSWORD_HASH,
  accountCountsByProduct,
  addSubscriber,
  claimAccount,
  countAdmins,
  countAvailableAccounts,
  createSession,
  createUser,
  deleteAccount,
  deleteCategory,
  deleteCoupon,
  deleteProduct,
  deleteSession,
  deleteSessionsForUser,
  deleteSessionsForUserExcept,
  evaluateCoupon,
  findSession,
  findUserById,
  findUserByUsername,
  getAccountById,
  getAllSettings,
  getCategoryById,
  getCouponByCode,
  getCouponById,
  getOrderById,
  getOrderByPaymentId,
  getProductBySlug,
  getReportsOverview,
  getSalesSeries,
  getStockAlerts,
  getTopCustomers,
  getTopProducts,
  hashPassword,
  insertActivityLog,
  insertCategory,
  insertCoupon,
  insertOrder,
  insertOrderEvent,
  insertProduct,
  incrementCouponUses,
  listAccountsByProduct,
  listActivityLogs,
  listAllOrders,
  listCategories,
  listCoupons,
  listMovements,
  listOrderEvents,
  listOrdersByUser,
  listProducts,
  listUserOrders,
  listUsers,
  logMovement,
  pruneExpiredSessions,
  seedAdmin,
  seedCatalog,
  setOrderCoupon,
  setSettings,
  updateAccount,
  updateCategory,
  updateCoupon,
  updateOrderPayment,
  updateOrderStatus,
  updatePassword,
  updatePaymentStatus,
  updateProduct,
  updateUser,
  updateUserBanned,
  updateUserRole,
  verifyPassword,
  type AccountRow,
  type CategoryRow,
  type CouponEvaluation,
  type CouponRow,
  type OrderListOptions,
  type OrderRow,
  type ProductRow,
  type UserRow,
} from "./db.ts";
import {
  createAccount,
  createPixPayment,
  deliverOrder,
  generateAccounts,
  getMpConfig,
  getPaymentStatus,
  markOrderCancelled,
  markOrderPaid,
  refundPayment,
  verifyWebhookSignature,
  type OrderEventActor,
} from "./mp.ts";

/* ============================================================
   SERVER — API real do SATOSHII STORE.
   Auth: scrypt (hash) + token de sessão com expiração de 30 dias.
   Pagamentos: PIX via Mercado Pago (simulation|live) + 3 modos de entrega.
   ============================================================ */

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------- uploads de imagens (produtos com FOTOS REAIS ou links) ---------- */
// Na Vercel o filesystem é efêmero e somente /tmp é gravável — usamos /tmp lá
// para o upload não quebrar (arquivos não persistem entre cold starts; para
// persistência real seria preciso Supabase Storage).
const uploadsDir = process.env.VERCEL ? join("/tmp", "uploads") : join(__dirname, "uploads");
try {
  mkdirSync(uploadsDir, { recursive: true });
} catch {
  // filesystem somente-leitura (casos extremos) — uploads ficam desabilitados
}

const mimeToExt: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = mimeToExt[file.mimetype] ?? "png";
      cb(null, `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.mimetype);
    cb(ok ? null : new Error("Tipo de arquivo não suportado."), ok);
  },
});

/* Carrega .env manualmente (sem dotenv), sem sobrescrever vars já definidas. */
(function loadDotEnv(): void {
  try {
    const envPath = join(__dirname, "..", ".env");
    if (!existsSync(envPath)) return;
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // sem .env → segue com as variáveis do ambiente
  }
})();

const PORT = Number(process.env.PORT ?? 3001);
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const PUBLIC_BASE = process.env.PUBLIC_BASE ?? `http://localhost:${PORT}`;

const app = express();
app.use(express.json({ limit: "256kb" }));
/* Uploads de imagens de produtos servidos estaticamente em /uploads */
app.use("/uploads", express.static(uploadsDir));

/* ---------- CORS (whitelist via env; dev libera tudo) ---------- */
// Produção: defina ALLOWED_ORIGINS="https://sua-loja.com,https://admin.sua-loja.com"
// para refletir apenas origens confiáveis. Sem a env, mantemos "*" para dev.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ---------- helpers de auth ---------- */

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

/** Serializa o usuário sem o hash de senha. */
function publicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar,
    role: row.role,
    createdAt: row.created_at,
  };
}

/* ---------- middleware de autenticação ---------- */

interface AuthRequest extends Request {
  user: UserRow;
  token: string;
}

async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  const session = await findSession(token);
  if (!session || session.expires_at < Date.now()) {
    if (session) await deleteSession(token);
    res.status(401).json({ error: "Sessão expirada. Entre novamente." });
    return;
  }

  const user = await findUserById(session.user_id);
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }

  // Usuário banido: derruba a sessão e nega acesso (inclusive sessões já emitidas).
  if (user.banned) {
    await deleteSession(token);
    res.status(403).json({ error: "Conta banida." });
    return;
  }

  (req as AuthRequest).user = user;
  (req as AuthRequest).token = token;
  next();
}

/* ---------- middleware de administrador ---------- */

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthRequest).user.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito ao administrador." });
    return;
  }
  next();
}

/* ---------- auditoria de ações do admin (activity_logs) ---------- */

/** Registra uma ação do admin. IP real vindo do socket (sem trust proxy → não confia
 *  no X-Forwarded-For, que seria spoofável por clientes). */
async function logAdminAction(
  req: Request,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  details?: unknown,
): Promise<void> {
  await insertActivityLog({
    id: genId("log"),
    admin_id: (req as AuthRequest).user.id,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    details:
      details === undefined || details === null
        ? null
        : typeof details === "string"
          ? details
          : JSON.stringify(details),
    ip: req.socket.remoteAddress ?? "unknown",
  });
}

/** Ator para order_events quando a origem é uma rota admin (req.user é admin). */
function adminActor(req: Request): OrderEventActor {
  return { type: "admin", id: (req as AuthRequest).user.id };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_-]+$/;

/** Valida o checksum de um CPF (algoritmo oficial). Aceita só dígitos. */
function isValidCpf(value: string): boolean {
  const d = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

/** Normaliza username: minúsculas, sem espaços nas pontas. */
function normalizeUsername(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

/* ---------- rate limit em memória (janela deslizante por chave) ---------- */

const rateBuckets = new Map<string, number[]>();
const RATE_WINDOW_MAX = 60 * 60 * 1000; // 1h — a maior janela usada

// Limpa hits antigos periodicamente para o Map não crescer sem limite.
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of rateBuckets) {
    const alive = hits.filter((t) => now - t < RATE_WINDOW_MAX);
    if (alive.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, alive);
  }
}, 5 * 60 * 1000).unref();

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim() !== "") return fwd.split(",")[0].trim();
  return req.ip ?? "unknown";
}

/** Registra um hit na janela deslizante; retorna false se estourou o limite. */
function rateLimitHit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    rateBuckets.set(key, hits); // mantém os hits para continuar bloqueando
    return false;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return true;
}

function rateLimitReset(key: string): void {
  rateBuckets.delete(key);
}

/* ---------- pagamentos (modos de entrega + config fail-fast) ---------- */

const DELIVERY_MODES = ["auto", "adm", "manual"] as const;
type DeliveryMode = (typeof DELIVERY_MODES)[number];

function normalizeDeliveryMode(value: unknown): DeliveryMode {
  const v = String(value ?? "").trim();
  return (DELIVERY_MODES as readonly string[]).includes(v) ? (v as DeliveryMode) : "manual";
}

try {
  getMpConfig(); // fail-fast: PAYMENTS_MODE=live sem token/secret → aborta o boot local
} catch (err) {
  console.error(
    "[server] Configuração de pagamentos inválida:",
    err instanceof Error ? err.message : err,
  );
  if (process.env.VERCEL) {
    // Em produção a config vem do painel da Vercel; se faltar, o erro aparece
    // por pedido (PIX não gera) sem derrubar a função inteira.
    console.error("[server] Continuando — defina MP_ACCESS_TOKEN no painel da Vercel.");
  } else {
    process.exit(1);
  }
}

/* ---------- rotas de autenticação ---------- */

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  const cleanUsername = normalizeUsername(username);

  const ip = clientIp(req);
  if (!rateLimitHit(`reg:${ip}`, 10, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Muitos cadastros a partir deste IP. Aguarde uma hora e tente novamente." });
    return;
  }

  if (cleanUsername.length < 3) {
    res.status(400).json({ error: "Username precisa de pelo menos 3 caracteres." });
    return;
  }
  if (!USERNAME_RE.test(cleanUsername)) {
    res.status(400).json({ error: "Username inválido. Use apenas letras, números, _ e -." });
    return;
  }
  if (String(password ?? "").length < 6) {
    res.status(400).json({ error: "Senha precisa de pelo menos 6 caracteres." });
    return;
  }
  if (await findUserByUsername(cleanUsername)) {
    res.status(409).json({ error: "Este username já está cadastrado." });
    return;
  }

  const user = {
    id: genId("usr"),
    username: cleanUsername,
    password_hash: await hashPassword(String(password)),
    avatar: "🦊",
    role: "user",
  };
  try {
    await createUser(user);
  } catch (err) {
    // corrida: outro request criou o mesmo username entre o check e o INSERT
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Este username já está cadastrado." });
      return;
    }
    throw err; // vai para o handler global (500 JSON)
  }

  await pruneExpiredSessions();
  await deleteSessionsForUser(user.id); // 1 sessão ativa por usuário
  const token = randomBytes(32).toString("hex");
  await createSession(token, user.id, Date.now() + SESSION_MS);
  // busca o registro completo para incluir createdAt (o objeto acima não tem created_at)
  res.status(201).json({ token, user: publicUser((await findUserById(user.id))!) });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  const cleanUsername = normalizeUsername(username);
  const ip = clientIp(req);

  const rateKey = `${ip}:${cleanUsername}`;
  if (!rateLimitHit(rateKey, 5, 15 * 60 * 1000)) {
    res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
    return;
  }

  const user = await findUserByUsername(cleanUsername);
  // Username inexistente: roda o scrypt contra um hash dummy para não
  // vazar tempo de resposta (timing attack). Mensagem é idêntica nos dois casos.
  const ok = user
    ? await verifyPassword(String(password ?? ""), user.password_hash)
    : await verifyPassword(String(password ?? ""), DUMMY_PASSWORD_HASH);
  if (!user || !ok) {
    res.status(401).json({ error: "Username ou senha incorretos." });
    return;
  }
  if (user.banned) {
    res.status(403).json({ error: "Conta banida. Entre em contato com o suporte." });
    return;
  }

  rateLimitReset(rateKey); // sucesso: zera as falhas acumuladas
  await pruneExpiredSessions();
  await deleteSessionsForUser(user.id); // 1 sessão ativa por usuário
  const token = randomBytes(32).toString("hex");
  await createSession(token, user.id, Date.now() + SESSION_MS);
  res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/logout", auth, async (req, res) => {
  await deleteSession((req as AuthRequest).token);
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: publicUser((req as AuthRequest).user) });
});

/* ---------- perfil ---------- */

app.patch("/api/users/me", auth, async (req, res) => {
  const me = req as AuthRequest;
  const body = req.body ?? {};

  const usernameSent = body.username !== undefined && body.username !== null && String(body.username) !== "";
  const username = usernameSent ? normalizeUsername(body.username) : me.user.username;
  const avatar = String(body.avatar ?? me.user.avatar).trim();

  // Só valida username quando ele foi ENVIADO e é DIFERENTE do atual — assim um
  // usuário migrado com username inválido (ex "john.doe") pode editar avatar/senha
  // sem ser barrado, e corrigir o username para um válido.
  if (usernameSent && username !== me.user.username) {
    if (username.length < 3) {
      res.status(400).json({ error: "Username precisa de pelo menos 3 caracteres." });
      return;
    }
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({ error: "Username inválido. Use apenas letras, números, _ e -." });
      return;
    }
    const existing = await findUserByUsername(username);
    if (existing && existing.id !== me.user.id) {
      res.status(409).json({ error: "Este username já está cadastrado." });
      return;
    }
  }
  if (!avatar || avatar.length > 8) {
    res.status(400).json({ error: "Avatar inválido." });
    return;
  }

  // Troca de senha (opcional) — valida tudo antes de mutar.
  const senhaAtual = body.senhaAtual;
  if (senhaAtual !== undefined && senhaAtual !== null && String(senhaAtual) !== "") {
    const novaSenha = String(body.novaSenha ?? "");
    const senhaOk = await verifyPassword(String(senhaAtual), me.user.password_hash);
    if (!senhaOk) {
      res.status(400).json({ error: "Senha atual incorreta." });
      return;
    }
    if (novaSenha.length < 6) {
      res.status(400).json({ error: "Senha precisa de pelo menos 6 caracteres." });
      return;
    }
    await updatePassword(me.user.id, await hashPassword(novaSenha));
    // derruba as outras sessões (mantém a atual = token do request)
    await deleteSessionsForUserExcept(me.user.id, me.token);
  }

  try {
    await updateUser(me.user.id, username, avatar);
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Este username já está cadastrado." });
      return;
    }
    throw err; // vai para o handler global (500 JSON)
  }
  const updated = await findUserById(me.user.id);
  res.json({ user: publicUser(updated!) });
});

/* ---------- catálogo ---------- */

async function serializeProduct(r: ProductRow) {
  return {
    slug: r.slug,
    sku: r.sku,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    price: r.price,
    oldPrice: r.old_price,
    categoryId: r.category_id,
    emoji: r.emoji,
    hueA: r.hue_a,
    hueB: r.hue_b,
    badges: JSON.parse(r.badges) as string[],
    rating: r.rating,
    reviews: r.reviews,
    stock:
      r.delivery_mode === "auto" || r.delivery_mode === "adm"
        ? await countAvailableAccounts(r.slug)
        : r.stock,
    featured: Boolean(r.featured),
    deliveryMode: r.delivery_mode,
    // Fase D — produto completo (painel admin)
    tags: parseJsonArray(r.tags),
    banner: r.banner,
    active: Boolean(r.active),
    maxQty: r.max_qty,
    unlimitedStock: Boolean(r.unlimited_stock),
    hideWhenZero: Boolean(r.hide_when_zero),
    extras: parseJsonArray(r.extras),
    faq: parseJsonArray(r.faq),
    garantia: r.garantia,
    termos: r.termos,
    imageUrls: parseImageUrls(r.image_urls),
  };
}

/** Número fake estável por slug (20..45) — produtos manuais são infinitos,
 *  mas a vitrine mostra um número plausível que nunca zera. */
function fakeManualStock(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return 20 + (h % 26);
}

/** Estoque exibido na vitrine por modo de entrega:
 *  auto/adm → nº de contas disponíveis (limite real);
 *  manual → número fake estável (produto é infinito);
 *  demais → comportamento legado (unlimited ? null : stock). */
async function publicStockFor(r: ProductRow): Promise<{ stock: number | null; unlimited: boolean }> {
  if (r.delivery_mode === "auto" || r.delivery_mode === "adm") {
    return { stock: await countAvailableAccounts(r.slug), unlimited: false };
  }
  if (r.delivery_mode === "manual") {
    return { stock: fakeManualStock(r.slug), unlimited: false };
  }
  return { stock: r.unlimited_stock ? null : r.stock, unlimited: Boolean(r.unlimited_stock) };
}

/** Produto aparece na vitrine? auto/adm usa contas disponíveis como estoque. */
async function isPubliclyVisible(p: ProductRow): Promise<boolean> {
  if (!Boolean(p.active)) return false;
  if (!p.hide_when_zero) return true;
  if (p.unlimited_stock === 1) return true;
  if (p.delivery_mode === "auto" || p.delivery_mode === "adm") return (await countAvailableAccounts(p.slug)) > 0;
  return p.stock > 0;
}

/** Serialização PÚBLICA da vitrine: omite active/sku, mostra o essencial.
 *  - unlimited_stock → stock:null + unlimitedStock:true (estoque "infinito");
 *  - esconde produtos inativos ou com hide_when_zero sem estoque (na rota). */
async function serializeProductPublic(r: ProductRow) {
  const { stock, unlimited } = await publicStockFor(r);
  return {
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    price: r.price,
    oldPrice: r.old_price,
    categoryId: r.category_id,
    emoji: r.emoji,
    hueA: r.hue_a,
    hueB: r.hue_b,
    badges: JSON.parse(r.badges) as string[],
    rating: r.rating,
    reviews: r.reviews,
    stock,
    featured: Boolean(r.featured),
    deliveryMode: r.delivery_mode,
    tags: parseJsonArray(r.tags),
    banner: r.banner,
    extras: parseJsonArray(r.extras),
    faq: parseJsonArray(r.faq),
    garantia: r.garantia,
    termos: r.termos,
    maxQty: r.max_qty,
    unlimitedStock: unlimited,
    imageUrls: parseImageUrls(r.image_urls),
  };
}

/** Faz parse seguro de coluna JSON do tipo array (tolerante a valores inválidos). */
function parseJsonArray(value: string | null | undefined, fallback: unknown[] = []): unknown[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Faz parse seguro da coluna image_urls (JSON array de strings). */
function parseImageUrls(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function serializeCategory(r: CategoryRow) {
  return {
    id: r.id,
    name: r.name,
    iconKey: r.icon_key,
    emoji: r.emoji,
    color: r.color,
    gradient: r.gradient,
    blurb: r.blurb,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.get("/api/products", async (_req, res) => {
  const products = [];
  for (const p of await listProducts()) {
    if (await isPubliclyVisible(p)) products.push(p);
  }
  res.json({ products: await Promise.all(products.map(serializeProductPublic)) });
});

app.get("/api/products/:slug", async (req, res) => {
  const product = await getProductBySlug(req.params.slug);
  const visible = product && (await isPubliclyVisible(product));
  if (!visible) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  res.json({ product: await serializeProductPublic(product) });
});

app.get("/api/categories", async (_req, res) => {
  res.json({ categories: (await listCategories()).map(serializeCategory) });
});

/* ---------- pedidos ---------- */

app.get("/api/orders", auth, async (req, res) => {
  const rows = await listOrdersByUser((req as AuthRequest).user.id);
  res.json({
    orders: rows.map(serializeOrder),
  });
});

app.post("/api/orders", auth, async (req, res) => {
  const b = req.body ?? {};
  const email = String(b.customer?.email ?? "").trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "E-mail inválido." });
    return;
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    res.status(400).json({ error: "Carrinho vazio." });
    return;
  }

  const mpConfig = getMpConfig();
  const cpf = String(b.customer?.cpf ?? "").replace(/\D/g, "");
  if (mpConfig.mode === "live") {
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "E-mail obrigatório." });
      return;
    }
    if (!/^\d{11}$/.test(cpf)) {
      res.status(400).json({ error: "CPF obrigatório." });
      return;
    }
    if (!isValidCpf(cpf)) {
      res.status(400).json({ error: "CPF inválido." });
      return;
    }
  }

  // Valida cada item no DB, recomputa total no servidor (nunca confia no cliente)
  // e deriva o delivery_mode do pedido = mais restritivo (manual > adm > auto).
  const RANK: Record<DeliveryMode, number> = { auto: 0, adm: 1, manual: 2 };
  let subtotal = 0;
  let deliveryMode: DeliveryMode = "auto";
  const items: Array<{ productId: string; qty: number }> = [];
  for (const it of b.items) {
    const productId = String(it?.productId ?? "");
    const qty = Math.floor(Number(it?.qty));
    const product = await getProductBySlug(productId);
    if (!product) {
      res.status(400).json({ error: `Produto não encontrado: ${productId}` });
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      res.status(400).json({ error: "Quantidade inválida." });
      return;
    }
    // Fase D — produto inativo ou oculto (hide_when_zero sem estoque) não pode ser comprado
    if (!product.active) {
      res.status(400).json({ error: `Produto indisponível: ${product.name}.` });
      return;
    }
    if (product.hide_when_zero && !(await isPubliclyVisible(product))) {
      res.status(400).json({ error: `Produto indisponível: ${product.name}.` });
      return;
    }
    // Fase D — limite de unidades por pedido (max_qty)
    if (product.max_qty !== null && product.max_qty !== undefined && qty > product.max_qty) {
      res.status(400).json({
        error: `Quantidade máxima por pedido é ${product.max_qty} para ${product.name}.`,
      });
      return;
    }
    const effectiveStock =
      product.delivery_mode === "auto" || product.delivery_mode === "adm"
        ? await countAvailableAccounts(product.slug)
        : product.stock;
    if (product.unlimited_stock === 0 && effectiveStock < qty) {
      res.status(400).json({ error: `Estoque insuficiente para ${product.name}.` });
      return;
    }
    subtotal += product.price * qty;
    if (RANK[product.delivery_mode] > RANK[deliveryMode]) deliveryMode = product.delivery_mode;
    items.push({ productId, qty });
  }

  // Cupom opcional — valida e calcula o desconto ANTES de persistir (mesma lógica
  // do POST /api/checkout/validate-coupon). Desconto nunca pode deixar total < 0.
  const couponCode = String(b.coupon ?? "").trim().toUpperCase();
  let couponEval: CouponEvaluation | undefined;
  if (couponCode) {
    couponEval = await evaluateCoupon(couponCode, subtotal, items.map((i) => i.productId));
    if (!couponEval.valid) {
      res.status(400).json({ error: couponEval.message });
      return;
    }
  }
  const discountAmount = couponEval?.discount ?? 0;
  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  const orderId = genId("ord");
  const row: OrderRow = {
    id: orderId,
    user_id: (req as AuthRequest).user.id,
    customer_name: String(b.customer?.name ?? "").slice(0, 120),
    customer_email: email,
    customer_phone: String(b.customer?.phone ?? "").slice(0, 40),
    shipping_cep: "",
    shipping_street: "",
    shipping_number: "",
    shipping_complement: null,
    shipping_city: "",
    shipping_state: "",
    card_last4: "",
    items_json: JSON.stringify(items),
    subtotal,
    shipping_fee: 0,
    total,
    status: "pending",
    payment_id: null,
    payment_provider: mpConfig.mode === "live" ? "mercadopago" : "simulation",
    payment_status: "pending",
    delivery_mode: deliveryMode,
    needs_manual: 0,
    payment_expires_at: null,
    stock_decrement_json: null,
    delivery_json: null,
    processed_at: null,
    created_at: new Date().toISOString(),
  };
  await insertOrder(row);
  await insertOrderEvent({
    orderId,
    event: "created",
    actorType: "user",
    actorId: (req as AuthRequest).user.id,
    details: JSON.stringify({ total, mode: deliveryMode, items, couponCode: couponCode || null, discountAmount }),
  });

  // PIX (fetch ANTES de qualquer transação)
  // Só envia notification_url se houver uma URL pública real configurada.
  // O MP rejeita URLs locais (localhost), então omitimos quando não houver.
  const notificationUrl = process.env.MP_NOTIFICATION_URL ?? "";
  let pix;
  try {
    pix = await createPixPayment({
      amount: total,
      description: "Pedido Satoshii",
      payerEmail: email,
      payerCpf: cpf,
      externalRef: orderId,
      notificationUrl,
    });
  } catch (err) {
    await updateOrderStatus(orderId, "cancelled", null);
    const msg = err instanceof Error ? err.message : "Não foi possível gerar o PIX.";
    res.status(400).json({ error: msg });
    return;
  }
  await updateOrderPayment(orderId, {
    paymentId: pix.paymentId,
    provider: row.payment_provider,
    status: "pending",
    expiresAt: pix.expiresAt,
  });
  // Cupom aplicado SÓ depois do PIX criado com sucesso (C1-1): se o
  // createPixPayment falhar, o cupom não é consumido nem gravado no pedido.
  // (Sem await entre os UPDATEs — DatabaseSync, event loop não intercala.)
  if (couponEval?.valid && couponEval.coupon) {
    await setOrderCoupon(orderId, couponEval.coupon.code, discountAmount);
    if (!(await incrementCouponUses(couponEval.coupon.id))) {
      // Defensivo (C1-2): cupom esgotado entre a validação e o uso — desfaz o
      // cupom no pedido, cancela e responde 400 (não deixa pedido ativo).
      await setOrderCoupon(orderId, null, 0);
      await updateOrderStatus(orderId, "cancelled", null);
      res.status(400).json({ error: "Cupom esgotado. Remova o cupom e tente novamente." });
      return;
    }
  }
  await insertOrderEvent({
    orderId,
    event: "payment_created",
    actorType: "user",
    actorId: (req as AuthRequest).user.id,
    details: JSON.stringify({
      paymentId: pix.paymentId,
      provider: row.payment_provider,
      expiresAt: pix.expiresAt,
    }),
  });

  res.status(201).json({
    id: orderId,
    createdAt: row.created_at,
    couponCode: couponCode || null,
    discountAmount,
    payment: {
      paymentId: pix.paymentId,
      qrCode: pix.qrCode,
      qrCodeBase64: pix.qrCodeBase64,
      ticketUrl: pix.ticketUrl,
      expiresAt: pix.expiresAt,
    },
  });
});

app.get("/api/orders/:id", auth, async (req, res) => {
  const me = req as AuthRequest;
  let order = await getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  if (order.user_id !== me.user.id && me.user.role !== "admin") {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  // Polling do checkout: se expirou o PIX ainda em pagamento → cancela.
  // Só quando payment_status segue pending/null — pedido já aprovado (ex.: manual
  // aprovado pelo admin) NÃO pode ser cancelado pela expiração do PIX.
  if (
    order.status === "pending" &&
    (order.payment_status === "pending" || order.payment_status === null) &&
    order.payment_expires_at &&
    order.payment_expires_at < Date.now()
  ) {
    await updatePaymentStatus(order.id, "expired");
    await insertOrderEvent({
      orderId: order.id,
      event: "expired",
      actorType: "system",
      details: JSON.stringify({ paymentExpiresAt: order.payment_expires_at }),
    });
    await markOrderCancelled(order.id, { type: "system", id: null });
    order = (await getOrderById(order.id))!;
  }
  // Polling live: se ainda em pagamento, consulta o status no MP e confirma
  // quando aprovado (dispensa webhook/URL pública). Só para pagamentos reais.
  if (
    order.status === "pending" &&
    (order.payment_status === "pending" || order.payment_status === null) &&
    order.payment_id &&
    !String(order.payment_id).startsWith("sim_")
  ) {
    try {
      const mpStatus = await getPaymentStatus(order.payment_id);
      if (mpStatus === "approved") {
        await markOrderPaid(order.id, { type: "system", id: null });
      } else if (["rejected", "expired", "cancelled", "refunded", "charged_back"].includes(mpStatus)) {
        await updatePaymentStatus(order.id, mpStatus);
        await insertOrderEvent({
          orderId: order.id,
          event:
            mpStatus === "rejected"
              ? "payment_rejected"
              : mpStatus === "expired"
                ? "expired"
                : "refunded",
          actorType: "system",
          details: JSON.stringify({ mpStatus }),
        });
        await markOrderCancelled(order.id, { type: "system", id: null });
      }
      order = (await getOrderById(order.id))!;
    } catch {
      // falha de rede/MP — mantém como está; o próximo poll tenta de novo
    }
  }
  res.json({ order: serializeOrder(order) });
});

/* ---------- webhook do Mercado Pago (público, sem rate limit) ---------- */

app.post("/api/webhooks/mp", async (req, res) => {
  const body = req.body;
  if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body))) {
    res.status(400).json({ error: "Body inválido." });
    return;
  }
  if (!verifyWebhookSignature(req)) {
    res.status(401).json({ error: "Assinatura inválida." });
    return;
  }
  const mpConfig = getMpConfig();
  if (mpConfig.mode === "simulation") {
    // Em simulação a aprovação passa pelo endpoint do admin; só acusa recebimento.
    res.status(200).end();
    return;
  }

  const q = req.query as Record<string, unknown>;
  const nested = q.data as { id?: unknown } | undefined;
  const dataId = String(nested?.id ?? q["data.id"] ?? (body as { data?: { id?: unknown } } | undefined)?.data?.id ?? "");
  if (!dataId) {
    res.status(400).json({ error: "data.id ausente." });
    return;
  }
  const order = await getOrderByPaymentId(dataId);
  if (!order) {
    res.status(404).end(); // MP desiste de reenviar
    return;
  }

  let status: string;
  try {
    status = await getPaymentStatus(dataId);
  } catch {
    res.status(502).json({ error: "Falha ao consultar o Mercado Pago." });
    return;
  }
  await updatePaymentStatus(order.id, status);
  const actor: OrderEventActor = { type: "webhook", id: dataId };
  if (status === "approved") {
    await markOrderPaid(order.id, actor);
  } else if (["rejected", "expired", "cancelled", "refunded", "charged_back"].includes(status)) {
    // espelha o vocabulário do MP no order_events antes de cancelar/reembolsar
    const event = status === "rejected" ? "payment_rejected" : status === "expired" ? "expired" : "refunded";
    await insertOrderEvent({
      orderId: order.id,
      event,
      actorType: "webhook",
      actorId: dataId,
      details: JSON.stringify({ mpStatus: status }),
    });
    await markOrderCancelled(order.id, actor);
  }
  res.status(200).end();
});

/** Validação pública de cupom para o checkout. NÃO incrementa uses_count.
 *  Recomputa o subtotal no servidor (mesma regra do POST /api/orders). */
app.post("/api/checkout/validate-coupon", async (req, res) => {
  const b = req.body ?? {};
  const code = String(b.code ?? "").trim().toUpperCase();
  if (!code) {
    res.status(400).json({ error: "Informe o código do cupom." });
    return;
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    res.status(400).json({ error: "Carrinho vazio." });
    return;
  }
  let subtotal = 0;
  const productSlugs: string[] = [];
  for (const it of b.items) {
    const productId = String(it?.productId ?? "");
    const qty = Math.floor(Number(it?.qty));
    const product = await getProductBySlug(productId);
    if (!product || !Number.isFinite(qty) || qty < 1) {
      res.status(400).json({ error: "Carrinho inválido." });
      return;
    }
    subtotal += product.price * qty;
    productSlugs.push(productId);
  }
  const result = await evaluateCoupon(code, subtotal, productSlugs);
  res.json(result.valid ? { ...result, coupon: serializeCoupon(result.coupon!) } : result);
});

/** Serialização PÚBLICA de pedido — sem dados de pagamento (paymentId/status/provedor).
 *  O checkout/profile consomem apenas status, deliveryMode e delivery. */
function serializeOrder(r: OrderRow) {
  return {
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    deliveryMode: r.delivery_mode,
    needsManual: Boolean(r.needs_manual),
    processedAt: r.processed_at,
    delivery: r.delivery_json ? (JSON.parse(r.delivery_json) as { message: string }) : null,
    customer: {
      name: r.customer_name,
      email: r.customer_email,
      phone: r.customer_phone,
    },
    shipping: {
      cep: r.shipping_cep,
      street: r.shipping_street,
      number: r.shipping_number,
      complement: r.shipping_complement,
      city: r.shipping_city,
      state: r.shipping_state,
    },
    cardLast4: r.card_last4,
    items: JSON.parse(r.items_json) as unknown[],
    subtotal: r.subtotal,
    shippingFee: r.shipping_fee,
    total: r.total,
    couponCode: r.coupon_code,
    discountAmount: r.discount_amount ?? 0,
  };
}

/** Serialização ADMIN — tudo do serializeOrder + dados de pagamento (paymentId/status/
 *  provedor/expiração). Usada APENAS nas rotas /api/admin/*. */
function serializeOrderAdmin(r: OrderRow) {
  return {
    ...serializeOrder(r),
    paymentId: r.payment_id,
    paymentStatus: r.payment_status,
    paymentProvider: r.payment_provider,
    expiresAt: r.payment_expires_at,
  };
}

/** Serializa um cupom para as respostas de /api/admin/coupons e validate-coupon. */
function serializeCoupon(r: CouponRow) {
  return {
    id: r.id,
    code: r.code,
    type: r.type,
    value: r.value,
    minValue: r.min_value,
    maxUses: r.max_uses,
    usesCount: r.uses_count,
    active: Boolean(r.active),
    expiresAt: r.expires_at,
    productSlugs: r.product_slugs ? JSON.parse(r.product_slugs) : null,
    createdAt: r.created_at,
  };
}

/** Serializa um usuário para o painel admin (sem password_hash). */
function serializeUserAdmin(r: UserRow) {
  return {
    id: r.id,
    username: r.username,
    avatar: r.avatar,
    role: r.role,
    banned: Boolean(r.banned),
    createdAt: r.created_at,
  };
}

/** Converte valor de body para boolean tolerando string "false"/"0". */
function toBool(value: unknown, def = false): boolean {
  if (value === undefined || value === null) return def;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/* ---------- usuários (admin, A2) ---------- */

app.get("/api/admin/users", auth, requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { items, total, page, limit } = await listUsers({
    q: q.q,
    page: q.page !== undefined && q.page !== "" ? Number(q.page) : undefined,
    limit: q.limit !== undefined && q.limit !== "" ? Number(q.limit) : undefined,
    sort: q.sort === "asc" ? "asc" : "desc",
  });
  res.json({
    items: items.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      banned: Boolean(u.banned),
      createdAt: u.createdAt,
      orderCount: u.orderCount,
      totalSpent: u.totalSpent,
      lastOrderAt: u.lastOrderAt,
    })),
    total,
    page,
    limit,
  });
});

app.get("/api/admin/users/:id/orders", auth, requireAdmin, async (req, res) => {
  const user = await findUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  const rows = await listUserOrders(user.id);
  res.json({
    user: { id: user.id, username: user.username },
    orders: rows.map((o) => ({
      ...serializeOrderAdmin(o),
      user: { id: user.id, username: user.username },
    })),
  });
});

app.patch("/api/admin/users/:id", auth, requireAdmin, async (req, res) => {
  const target = await findUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  const me = req as AuthRequest;
  const b = req.body ?? {};

  if (b.role !== undefined && b.role !== null) {
    const role = String(b.role);
    if (role !== "admin" && role !== "user") {
      res.status(400).json({ error: "Role inválido. Use 'admin' ou 'user'." });
      return;
    }
    if (role !== target.role) {
      if (target.id === me.user.id && role !== "admin") {
        res.status(400).json({ error: "Você não pode remover o próprio acesso de administrador." });
        return;
      }
      if (role === "user" && target.role === "admin" && (await countAdmins()) <= 1) {
        res.status(400).json({ error: "Não é possível depor o último administrador." });
        return;
      }
      await updateUserRole(target.id, role);
      if (role === "user") await deleteSessionsForUser(target.id); // perde o acesso imediatamente
      await logAdminAction(req, "user.role", "user", target.id, { from: target.role, to: role });
    }
  }

  if (b.banned !== undefined && b.banned !== null) {
    const banned = toBool(b.banned);
    if (target.id === me.user.id && banned) {
      res.status(400).json({ error: "Você não pode banir a própria conta." });
      return;
    }
    await updateUserBanned(target.id, banned);
    // NÃO derruba as sessões aqui: o middleware auth responde 403 para token de banido
    // (e limpa a sessão nesse momento). Assim "conta banida" (403) é distinta de
    // "sessão expirada/inexistente" (401), conforme o contrato da A2.
    await logAdminAction(req, "user.ban", "user", target.id, { banned });
  }

  res.json({ user: serializeUserAdmin((await findUserById(target.id))!) });
});

app.post("/api/admin/users/:id/reset-password", auth, requireAdmin, async (req, res) => {
  const target = await findUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  // 6 bytes → 8 chars base64url (senha temporária suficiente p/ forçar re-login)
  const newPassword = randomBytes(6).toString("base64url");
  await updatePassword(target.id, await hashPassword(newPassword));
  await deleteSessionsForUser(target.id); // derruba sessões → re-login com a senha nova
  await logAdminAction(req, "user.reset_password", "user", target.id, {});
  res.json({ ok: true, password: newPassword });
});

/* ---------- cupons (admin, A2) ---------- */

const COUPON_CODE_RE = /^[A-Z0-9_-]{3,40}$/;

app.get("/api/admin/coupons", auth, requireAdmin, async (_req, res) => {
  res.json({ coupons: (await listCoupons()).map(serializeCoupon) });
});

app.post("/api/admin/coupons", auth, requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const code = String(b.code ?? "").trim().toUpperCase();
  if (!COUPON_CODE_RE.test(code)) {
    res.status(400).json({ error: "Código inválido. Use 3-40 caracteres (letras, números, _ ou -)." });
    return;
  }
  if (await getCouponByCode(code)) {
    res.status(409).json({ error: "Já existe um cupom com este código." });
    return;
  }
  const type = String(b.type ?? "");
  if (type !== "fixed" && type !== "percent") {
    res.status(400).json({ error: "Tipo inválido. Use 'fixed' ou 'percent'." });
    return;
  }
  const value = Number(b.value);
  if (!Number.isFinite(value) || value <= 0) {
    res.status(400).json({ error: "Valor do desconto deve ser maior que zero." });
    return;
  }
  if (type === "percent" && value >= 100) {
    res.status(400).json({ error: "Cupom percentual deve ser menor que 100%." });
    return;
  }
  const minValue = Number.isFinite(Number(b.minValue)) ? Math.max(0, Number(b.minValue)) : 0;
  const maxUses =
    b.maxUses === undefined || b.maxUses === null || b.maxUses === ""
      ? null
      : Math.max(0, Math.floor(Number(b.maxUses)));

  const row: CouponRow = {
    id: genId("cpn"),
    code,
    type,
    value,
    min_value: minValue,
    max_uses: maxUses,
    uses_count: 0,
    active: toBool(b.active, true) ? 1 : 0,
    expires_at: b.expiresAt ? String(b.expiresAt) : null,
    product_slugs: Array.isArray(b.productSlugs) ? JSON.stringify(b.productSlugs.map(String)) : null,
  };
  await insertCoupon(row);
  await logAdminAction(req, "coupon.create", "coupon", row.id, { code, type, value });
  res.status(201).json({ coupon: serializeCoupon((await getCouponById(row.id))!) });
});

app.patch("/api/admin/coupons/:id", auth, requireAdmin, async (req, res) => {
  const existing = await getCouponById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Cupom não encontrado." });
    return;
  }
  const b = req.body ?? {};
  const next: CouponRow = { ...existing };

  if (b.code !== undefined) {
    const code = String(b.code).trim().toUpperCase();
    if (!COUPON_CODE_RE.test(code)) {
      res.status(400).json({ error: "Código inválido. Use 3-40 caracteres (letras, números, _ ou -)." });
      return;
    }
    const dup = await getCouponByCode(code);
    if (dup && dup.id !== existing.id) {
      res.status(409).json({ error: "Já existe um cupom com este código." });
      return;
    }
    next.code = code;
  }
  if (b.type !== undefined) {
    const type = String(b.type);
    if (type !== "fixed" && type !== "percent") {
      res.status(400).json({ error: "Tipo inválido. Use 'fixed' ou 'percent'." });
      return;
    }
    next.type = type;
  }
  if (b.value !== undefined) {
    const value = Number(b.value);
    if (!Number.isFinite(value) || value <= 0) {
      res.status(400).json({ error: "Valor do desconto deve ser maior que zero." });
      return;
    }
    next.value = value;
  }
  if (next.type === "percent" && next.value >= 100) {
    res.status(400).json({ error: "Cupom percentual deve ser menor que 100%." });
    return;
  }
  if (b.minValue !== undefined) {
    next.min_value = Number.isFinite(Number(b.minValue)) ? Math.max(0, Number(b.minValue)) : next.min_value;
  }
  if (b.maxUses !== undefined) {
    next.max_uses =
      b.maxUses === null || b.maxUses === "" ? null : Math.max(0, Math.floor(Number(b.maxUses)));
  }
  if (b.active !== undefined) {
    next.active = toBool(b.active, Boolean(next.active)) ? 1 : 0;
  }
  if (b.expiresAt !== undefined) {
    next.expires_at = b.expiresAt ? String(b.expiresAt) : null;
  }
  if (b.productSlugs !== undefined) {
    next.product_slugs = Array.isArray(b.productSlugs) ? JSON.stringify(b.productSlugs.map(String)) : null;
  }

  await updateCoupon(existing.id, next);
  await logAdminAction(req, "coupon.update", "coupon", existing.id, { code: next.code });
  res.json({ coupon: serializeCoupon((await getCouponById(existing.id))!) });
});

app.delete("/api/admin/coupons/:id", auth, requireAdmin, async (req, res) => {
  const coupon = await getCouponById(req.params.id);
  if (!coupon) {
    res.status(404).json({ error: "Cupom não encontrado." });
    return;
  }
  await deleteCoupon(coupon.id);
  await logAdminAction(req, "coupon.delete", "coupon", coupon.id, { code: coupon.code });
  res.json({ ok: true });
});

/* ---------- painel admin ---------- */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_ID_RE = /^[a-z0-9-]+$/;

/* GET /api/admin/orders — filtros (status/deliveryMode/needsManual/q), paginação
   (page/limit) e ordenação (sort=asc|desc; default desc por created_at).
   SEM query → mantém o contrato legado: retorna TODOS com a ordenação
   pending→approved→resto (usado pelo AdminPage atual, que não envia query). */
app.get("/api/admin/orders", auth, requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const hasQuery = Object.keys(q).some((k) => q[k] !== undefined && q[k] !== "");

  const withUser = async (o: OrderRow) => {
    const user = o.user_id ? await findUserById(o.user_id) : undefined;
    return {
      ...serializeOrderAdmin(o),
      user: user ? { id: user.id, username: user.username } : null,
    };
  };

  if (!hasQuery) {
    const all = await listAllOrders({ sort: "status" });
    res.json({ orders: await Promise.all(all.items.map(withUser)) });
    return;
  }

  const opts: OrderListOptions = {};
  if (q.status) opts.status = q.status;
  if (q.deliveryMode) opts.deliveryMode = q.deliveryMode;
  if (q.needsManual !== undefined) {
    opts.needsManual = ["1", "true", "yes"].includes(String(q.needsManual).toLowerCase());
  }
  // C-P1-1: filtro por payment_status — único ('refunded') ou múltiplos
  // separados por vírgula ('refunded,charged_back') → IN no listAllOrders.
  if (q.paymentStatus) {
    const ps = String(q.paymentStatus).trim();
    const values = ps.split(",").map((s) => s.trim()).filter(Boolean);
    const allowed = new Set(["pending", "approved", "refunded", "charged_back"]);
    if (values.length === 0 || !values.every((v) => allowed.has(v))) {
      res
        .status(400)
        .json({ error: "paymentStatus inválido. Use: pending, approved, refunded, charged_back." });
      return;
    }
    opts.paymentStatus = values.join(",");
  }
  if (q.q) opts.q = q.q;
  if (q.page !== undefined && q.page !== "") opts.page = Number(q.page);
  if (q.limit !== undefined && q.limit !== "") opts.limit = Number(q.limit);
  if (q.sort === "asc" || q.sort === "desc") opts.sort = q.sort;

  const { items, total, page, limit } = await listAllOrders(opts);
  res.json({ orders: await Promise.all(items.map(withUser)), total, page, limit });
});

app.patch("/api/admin/orders/:id/status", auth, requireAdmin, async (req, res) => {
  const order = await getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  const status = String(req.body?.status ?? "");
  if (!["approved", "delivered", "cancelled"].includes(status)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }
  if (order.status === "cancelled") {
    res.status(400).json({ error: "Pedido já cancelado." });
    return;
  }
  // delivered só aceita cancelled (refund/estorno pós-entrega) — as demais ações são finais
  if (order.status === "delivered" && status !== "cancelled") {
    res.status(400).json({ error: "Pedido já entregue." });
    return;
  }

  await logAdminAction(req, "order.status", "order", order.id, { from: order.status, to: status });

  if (status === "approved") {
    // O admin pode aprovar qualquer pedido pendente, independente do modo de
    // entrega (manual/auto/adm) e mesmo sem o pagamento ter sido confirmado.
    // markOrderPaid deriva a entrega pelo delivery_mode: auto → claim de contas
    // e entrega automática; adm → approved + needs_manual; manual → aguarda o
    // admin entregar. Só bloqueia se o pagamento já foi aprovado (nada a fazer).
    if (order.payment_status === "approved") {
      res.status(400).json({ error: "Pagamento já aprovado." });
      return;
    }
    await markOrderPaid(order.id, adminActor(req));
    // approved é a porta de saída de pending no fluxo manual (só aqui, não no mp.ts,
    // para o webhook NÃO aprovar pedido manual sozinho). Para auto/adm o
    // markOrderPaid já define o status final (delivered/approved).
    const after = await getOrderById(order.id);
    if (after && after.status !== "approved" && after.status !== "delivered") {
      await updateOrderStatus(order.id, "approved", null);
    }
    const updated = await getOrderById(order.id);
    res.json({ order: serializeOrderAdmin(updated!) });
    return;
  }

  let deliveryJson: string | null = null;
  if (status === "delivered") {
    const message = String(req.body?.delivery?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ error: "Informe o conteúdo da entrega (ex: contas e senhas)." });
      return;
    }
    if (order.delivery_mode === "auto" && order.needs_manual !== 1) {
      res.status(400).json({ error: "Pedidos auto são entregues automaticamente." });
      return;
    }
    // adm: MP valida o pagamento (webhook/simulação) e o ADM entrega — permitido
    // APENAS com pagamento aprovado (reusa o caminho de entrega logo abaixo).
    if (order.delivery_mode === "adm" && order.payment_status !== "approved") {
      res.status(400).json({ error: "Pedido adm só pode ser entregue com pagamento aprovado." });
      return;
    }
    deliveryJson = JSON.stringify({ message });
    if (order.payment_status !== "approved") {
      await updatePaymentStatus(order.id, "approved");
      await markOrderPaid(order.id, adminActor(req));
      const re = await getOrderById(order.id);
      if (re && re.status === "delivered") {
        res.json({ order: serializeOrderAdmin(re) });
        return;
      }
    }
  }

  if (status === "cancelled") {
    // passa por markOrderCancelled para reverter stock (ledger) e contas claimadas
    const wasDelivered = order.status === "delivered";
    await markOrderCancelled(order.id, adminActor(req));
    // C2-1: refund pós-entrega — espelha a rota /refund no payment_status
    if (wasDelivered) {
      await updatePaymentStatus(order.id, "refunded");
    }
    const updated = await getOrderById(order.id);
    res.json({ order: serializeOrderAdmin(updated!) });
    return;
  }

  if (status === "delivered") {
    // entrega manual do ADM (manual/adm aprovado ou auto com needs_manual)
    await insertOrderEvent({
      orderId: order.id,
      event: "delivery_started",
      actorType: "admin",
      actorId: (req as AuthRequest).user.id,
    });
  }
  await updateOrderStatus(order.id, status, deliveryJson);
  if (status === "delivered") {
    await insertOrderEvent({
      orderId: order.id,
      event: "delivered",
      actorType: "admin",
      actorId: (req as AuthRequest).user.id,
      details: JSON.stringify({ manual: true }),
    });
  }
  const updated = await getOrderById(order.id);
  res.json({ order: serializeOrderAdmin(updated!) });
});

/* ---------- simulação de pagamento (só quando PAYMENTS_MODE=simulation) ---------- */

if (getMpConfig().mode === "simulation") {
  app.post("/api/admin/simulate-payment", auth, requireAdmin, (req, res) => {
    const order = getOrderById(String(req.body?.orderId ?? ""));
    if (!order) {
      res.status(404).json({ error: "Pedido não encontrado." });
      return;
    }
    const outcome = String(req.body?.outcome ?? "approved");
    if (!["approved", "rejected", "expired"].includes(outcome)) {
      res.status(400).json({ error: "Outcome inválido." });
      return;
    }
    if (order.status !== "pending" || order.payment_status !== "pending") {
      res.status(400).json({ error: "Pedido não está pendente." });
      return;
    }
    logAdminAction(req, "order.simulate_payment", "order", order.id, { outcome });
    if (outcome === "approved") {
      updatePaymentStatus(order.id, "approved");
      markOrderPaid(order.id, adminActor(req));
    } else {
      updatePaymentStatus(order.id, outcome);
      insertOrderEvent({
        orderId: order.id,
        event: outcome === "rejected" ? "payment_rejected" : "expired",
        actorType: "admin",
        actorId: (req as AuthRequest).user.id,
        details: JSON.stringify({ outcome }),
      });
      markOrderCancelled(order.id, adminActor(req));
    }
    res.json({ order: serializeOrderAdmin(getOrderById(order.id)!) });
  });
}

/* ---------- produtos (admin) ---------- */

/** Lista TODOS os produtos sem filtro de visibilidade (active/hide_when_zero/
 *  unlimited_stock) para o painel — ao contrário da vitrine pública, produtos
 *  desativados precisam aparecer aqui para poderem ser reativados.
 *  Usa listProducts() (todas as linhas, ordenado por featured DESC, name). */
app.get("/api/admin/products", auth, requireAdmin, (_req, res) => {
  res.json({ products: listProducts().map(serializeProduct) });
});

/* Upload de imagens de produto (fotos reais). Multipart field "images", até 10 arquivos. */
app.post("/api/admin/images", auth, requireAdmin, upload.array("images", 10), (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const urls = files.map((f) => `/uploads/${f.filename}`);
  res.json({ urls });
});

/* ---------- contas de estoque (admin) ---------- */

/** Serialização camelCase de uma conta de estoque (Fase D). */
function serializeAccount(r: AccountRow) {
  return {
    id: r.id,
    productSlug: r.product_slug,
    email: r.email,
    password: r.password,
    emailPassword: r.email_password,
    codigoExtra: r.codigo_extra,
    observacoes: r.observacoes,
    used: r.used,
    orderId: r.order_id,
    createdAt: r.created_at,
  };
}

/** Valida/cria UMA conta com os campos extras da Fase D. */
function buildAndInsertAccount(
  productSlug: string,
  b: Record<string, unknown>,
): { ok: true; account: AccountRow } | { ok: false; error: string } {
  const email = String(b.email ?? b.username ?? "").trim();
  const password = String(b.password ?? "").trim();
  if (!email || !password) {
    return { ok: false, error: "E-mail e senha são obrigatórios." };
  }
  return {
    ok: true,
    account: createAccount({
      productSlug,
      email,
      password,
      emailPassword: b.emailPassword !== undefined && b.emailPassword !== null && String(b.emailPassword).trim()
        ? String(b.emailPassword).trim()
        : undefined,
      codigoExtra: b.codigoExtra !== undefined && b.codigoExtra !== null && String(b.codigoExtra).trim()
        ? String(b.codigoExtra).trim()
        : undefined,
      observacoes: b.observacoes !== undefined && b.observacoes !== null && String(b.observacoes).trim()
        ? String(b.observacoes).trim()
        : undefined,
    }),
  };
}

app.get("/api/admin/products/:slug/accounts", auth, requireAdmin, (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  res.json({ accounts: listAccountsByProduct(product.slug).map(serializeAccount) });
});

/** Cria conta(s) de estoque: { email, password, ... } (single) ou
 *  { accounts: [...] } (bulk). Retorna created/skipped no modo bulk. */
app.post("/api/admin/products/:slug/accounts", auth, requireAdmin, (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  const b = (req.body ?? {}) as Record<string, unknown>;

  // modo bulk
  if (Array.isArray(b.accounts)) {
    const created: AccountRow[] = [];
    const skipped: Array<{ email?: string; reason: string }> = [];
    for (const raw of b.accounts as unknown[]) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const email = String(item.email ?? item.username ?? "").trim();
      const result = buildAndInsertAccount(product.slug, item);
      if (!result.ok) {
        skipped.push({ email: email || undefined, reason: result.error });
        continue;
      }
      created.push(result.account);
      logMovement({
        productSlug: product.slug,
        kind: "account",
        action: "add",
        qty: 1,
        note: `Criação em lote: ${result.account.email}`,
      });
    }
    if (created.length > 0) {
      logAdminAction(req, "account.bulk_create", "account", null, {
        productSlug: product.slug,
        created: created.length,
        skipped: skipped.length,
      });
    }
    res.status(201).json({
      created: created.length,
      skipped,
      accounts: created.map(serializeAccount),
    });
    return;
  }

  // single
  const result = buildAndInsertAccount(product.slug, b);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logMovement({
    productSlug: product.slug,
    kind: "account",
    action: "add",
    qty: 1,
    note: `Criação manual: ${result.account.email}`,
  });
  logAdminAction(req, "account.create", "account", result.account.id, { productSlug: product.slug });
  res.status(201).json({ account: serializeAccount(result.account) });
});

/** Edita e-mail/senha e os campos extras de uma conta existente (Fase D). */
app.patch("/api/admin/accounts/:id", auth, requireAdmin, (req, res) => {
  const existing = getAccountById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const email = b.email !== undefined ? String(b.email).trim() : existing.email;
  const password = b.password !== undefined ? String(b.password).trim() : existing.password;
  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    return;
  }
  const strOrNull = (v: unknown): string | null =>
    v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();
  updateAccount(existing.id, {
    email,
    password,
    email_password: b.emailPassword !== undefined ? strOrNull(b.emailPassword) : existing.email_password,
    codigo_extra: b.codigoExtra !== undefined ? strOrNull(b.codigoExtra) : existing.codigo_extra,
    observacoes: b.observacoes !== undefined ? strOrNull(b.observacoes) : existing.observacoes,
  });
  logAdminAction(req, "account.update", "account", existing.id, { productSlug: existing.product_slug });
  res.json({ account: serializeAccount(getAccountById(existing.id)!) });
});

/** Importa contas de um texto (uma por linha). Separadores: ':' ';' '|'.
 *  Ordem: email:password:emailPassword?:codigoExtra?:observacoes?
 *  Linhas vazias e com "#" são ignoradas; contas sem e-mail+senha são puladas;
 *  duplicadas (case-insensitive, por produto) são reportadas. */
app.post("/api/admin/products/:slug/accounts/import", auth, requireAdmin, (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  const text = String((req.body ?? {}).text ?? "");
  if (!text.trim()) {
    res.status(400).json({ error: "Envie o texto das contas (uma por linha)." });
    return;
  }

  const existingEmails = new Set(
    listAccountsByProduct(product.slug).map((a) => a.email.trim().toLowerCase()),
  );
  const created: AccountRow[] = [];
  const skipped: Array<{ line: number; reason: string }> = [];
  const duplicates: string[] = [];

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/[:;|]/).map((s) => s.trim());
    const email = parts[0] ?? "";
    const password = parts[1] ?? "";
    if (!email || !password) {
      skipped.push({ line: idx + 1, reason: "E-mail e senha são obrigatórios." });
      return;
    }
    const key = email.toLowerCase();
    if (existingEmails.has(key)) {
      duplicates.push(email);
      return;
    }
    existingEmails.add(key);
    const account = createAccount({
      productSlug: product.slug,
      email,
      password,
      emailPassword: parts[2] || undefined,
      codigoExtra: parts[3] || undefined,
      observacoes: parts[4] || undefined,
    });
    created.push(account);
    logMovement({
      productSlug: product.slug,
      kind: "account",
      action: "add",
      qty: 1,
      note: `Import: ${account.email}`,
    });
  });

  if (created.length > 0) {
    logAdminAction(req, "account.import", "product", product.slug, {
      created: created.length,
      skipped: skipped.length,
      duplicates: duplicates.length,
    });
  }
  const firstTen = (arr: string[]): string[] => arr.slice(0, 10);
  res.status(201).json({
    created: created.length,
    skipped: skipped.length,
    duplicates: duplicates.length,
    createdEmails: firstTen(created.map((a) => a.email)),
    skippedLines: skipped.slice(0, 10),
    duplicateEmails: firstTen(duplicates),
  });
});

/** Exporta contas como texto (attachment). Formato email:password[:extras],
 *  CRLF, campos vazios no fim omitidos. */
app.get("/api/admin/products/:slug/accounts/export", auth, requireAdmin, (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  const lines = listAccountsByProduct(product.slug).map((a) => {
    const fields = [a.email, a.password, a.email_password, a.codigo_extra, a.observacoes];
    while (fields.length > 2) {
      const last = fields[fields.length - 1];
      if (last !== null && last !== undefined && last !== "") break;
      fields.pop();
    }
    return fields.map((f) => f ?? "").join(":");
  });
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="contas-${product.slug}.txt"`);
  res.send(lines.length > 0 ? `${lines.join("\r\n")}\r\n` : "");
});

/** Histórico de movimentações de estoque/contas de um produto (Fase D). */
app.get("/api/admin/products/:slug/movements", auth, requireAdmin, (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  const limit = Math.min(500, Math.max(1, Math.floor(Number(req.query.limit ?? 100))));
  res.json({
    movements: listMovements(product.slug, limit).map((m) => ({
      id: m.id,
      productSlug: m.product_slug,
      kind: m.kind,
      action: m.action,
      qty: m.qty,
      note: m.note,
      createdAt: m.created_at,
    })),
  });
});

app.post("/api/admin/products/:slug/accounts/generate", auth, requireAdmin, (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  const count = Math.min(50, Math.max(1, Math.floor(Number(req.body?.count ?? 1))));
  const created = generateAccounts(product.slug, count);
  for (const acc of created) {
    logMovement({
      productSlug: product.slug,
      kind: "account",
      action: "add",
      qty: 1,
      note: `Gerada: ${acc.email}`,
    });
  }
  logAdminAction(req, "account.generate", "product", product.slug, { count: created.length });
  res.status(201).json({ created: created.length });
});

/** DELETE em lote de contas de estoque — precisa vir ANTES de /accounts/:id
 *  (senão "batch" casaria com o parâmetro :id). Ignora ids inexistentes. */
app.delete("/api/admin/accounts/batch", auth, requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
  let deleted = 0;
  for (const id of ids) {
    if (!getAccountById(id)) continue;
    deleteAccount(id);
    deleted++;
  }
  if (deleted > 0) {
    logAdminAction(req, "account.batch_delete", "account", null, { deleted, sent: ids.length });
  }
  res.json({ deleted });
});

app.delete("/api/admin/accounts/:id", auth, requireAdmin, (req, res) => {
  if (!getAccountById(req.params.id)) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  deleteAccount(req.params.id);
  logAdminAction(req, "account.delete", "account", req.params.id);
  res.json({ ok: true });
});

/* ---------- A2b — refund, redelivery, backup/restore e ações em lote ---------- */

/** Contas já claimadas por um pedido (usadas na redelivery — conta única por venda). */
function claimedAccountsForOrder(orderId: string): AccountRow[] {
  return db
    .prepare("SELECT * FROM accounts WHERE order_id = ? AND used = 1 ORDER BY created_at")
    .all(orderId) as AccountRow[];
}

/** Refund explícito de um pedido approved ou delivered. Reverte estoque via ledger e
 *  devolve contas claimadas (markOrderCancelled); marca payment_status='refunded' e
 *  registra evento/log com o motivo.
 *  NOTA PAYMENTS_MODE=live (C2-2): ANTES do cancelamento local, estorna o dinheiro
 *  no Mercado Pago via refundPayment (POST /v1/payments/:id/refunds). Se o estorno
 *  falhar → 502 e NENHUMA ação local é executada. Em simulation é um no-op. */
app.post("/api/admin/orders/:id/refund", auth, requireAdmin, async (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  if (order.status !== "approved" && order.status !== "delivered") {
    res.status(400).json({ error: "Refund só é permitido para pedidos approved ou delivered." });
    return;
  }
  const me = req as AuthRequest;
  const reason = String(req.body?.reason ?? "").trim();

  // C2-2: estorno real no gateway em live, antes de qualquer alteração local.
  if (getMpConfig().mode === "live" && order.payment_id) {
    try {
      await refundPayment(order.payment_id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao estornar pagamento no gateway.";
      res.status(502).json({ error: message });
      return; // cancelamento local NÃO é executado
    }
  }

  markOrderCancelled(order.id, adminActor(req)); // reverte stock (ledger) + contas
  updatePaymentStatus(order.id, "refunded");
  // Evento explícito de refund com o motivo (markOrderCancelled já registra o
  // estado; este evento carrega a razão da ação do admin).
  insertOrderEvent({
    orderId: order.id,
    event: "refunded",
    actorType: "admin",
    actorId: me.user.id,
    details: JSON.stringify({ reason: reason || null, source: "admin_refund" }),
  });
  logAdminAction(req, "order.refund", "order", order.id, {
    reason: reason || null,
    from: order.status,
    to: "refunded",
  });
  res.json({ order: serializeOrderAdmin(getOrderById(order.id)!) });
});

/** Redelivery: reentrega um pedido approved ou delivered.
 *  - approved → entrega normalmente, claimando contas se delivery_mode=auto e o
 *    pedido ainda não tem conta claimada.
 *  - delivered → NUNCA claima nova conta (conta única por venda): reusa a já
 *    claimada e gera NOVO delivery_json (message + timestamp).
 *  Em ambos os casos o evento é `redelivered` (via deliverOrder com redeliver). */
app.post("/api/admin/orders/:id/redeliver", auth, requireAdmin, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  if (order.status !== "approved" && order.status !== "delivered") {
    res.status(400).json({ error: "Redelivery só é permitido para pedidos approved ou delivered." });
    return;
  }
  let message = String(req.body?.message ?? "").trim();
  const claimedBefore = claimedAccountsForOrder(order.id).length;

  // approved + auto sem conta claimada → claima 1 conta por unidade (transação própria;
  // falha parcial faz rollback para não deixar claim órfão).
  if (order.status === "approved" && order.delivery_mode === "auto" && claimedBefore === 0) {
    const items = JSON.parse(order.items_json || "[]") as Array<{ productId: string; qty: number }>;
    let needTotal = 0;
    const lines: string[] = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const it of items) {
        const qty = Math.max(1, Math.floor(Number(it?.qty) || 1));
        needTotal += qty;
        for (let u = 0; u < qty; u++) {
          const acc = claimAccount(it.productId, order.id);
          if (acc) {
            lines.push(`• ${it.productId}: e-mail ${acc.email} — senha: ${acc.password}`);
            logMovement({
              productSlug: it.productId,
              kind: "account",
              action: "claim",
              qty: 1,
              note: `Redelivery do pedido ${order.id}`,
            });
          } else throw new Error("sem contas disponíveis");
        }
      }
      if (lines.length !== needTotal) throw new Error("claim incompleto");
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      res.status(400).json({ error: "Sem contas disponíveis para a reentrega." });
      return;
    }
    if (!message) message = lines.join("\n");
  }

  // Mensagem default: contas claimadas (novas ou pré-existentes) ou entrega anterior.
  if (!message) {
    const claimed = claimedAccountsForOrder(order.id);
    if (claimed.length > 0) {
      message = claimed
        .map((a) => `• ${a.product_slug}: e-mail ${a.email} — senha: ${a.password}`)
        .join("\n");
    } else if (order.delivery_json) {
      try {
        message = String((JSON.parse(order.delivery_json) as { message?: string }).message ?? "").trim();
      } catch {
        message = "";
      }
    }
  }
  if (!message) {
    res.status(400).json({ error: "Informe a mensagem de redelivery." });
    return;
  }

  // reusa deliverOrder (mp.ts) com redeliver=true → novo delivery_json + evento redelivered
  deliverOrder(order.id, message, adminActor(req), { redeliver: true });
  logAdminAction(req, "order.redeliver", "order", order.id, {
    from: order.status,
    to: "delivered",
    accountsClaimed: claimedBefore === 0 && order.delivery_mode === "auto",
  });
  res.json({ order: serializeOrderAdmin(getOrderById(order.id)!) });
});

/* ---------- backup / restore (A2b) ---------- */

/** GET backup — baixa o arquivo SQLite atual como attachment.
 *  Faz wal_checkpoint(FULL) primeiro: como o DatabaseSync é síncrono, nada
 *  intercala entre o checkpoint e o readFileSync → snapshot consistente. */
app.get("/api/admin/backup", auth, requireAdmin, (_req, res) => {
  const dbPath = getDbPath();
  try {
    db.exec("PRAGMA wal_checkpoint(FULL)");
  } catch {
    // sem WAL/lock → segue com o conteúdo atual do arquivo
  }
  if (!existsSync(dbPath)) {
    res.status(404).json({ error: "Banco de dados não encontrado." });
    return;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="backup-${ts}.db"`);
  res.send(readFileSync(dbPath));
});

/** POST restore — recebe o .db binário (application/octet-stream), valida o header
 *  SQLite + integridade em um arquivo temporário ISOLADO, então fecha a conexão
 *  atual (checkpoint + remoção de WAL/shm), substitui o arquivo e reabre.
 *  Em falha restaura o arquivo anterior (bak) — o boot nunca quebra. */
app.post(
  "/api/admin/backup/restore",
  auth,
  requireAdmin,
  express.raw({ type: "application/octet-stream", limit: "200mb" }),
  async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: "Body binário ausente. Envie o arquivo .db como application/octet-stream." });
      return;
    }
    if (buf.subarray(0, 16).toString("latin1") !== "SQLite format 3\u0000") {
      res.status(400).json({ error: "Arquivo não é um banco SQLite válido." });
      return;
    }
    const dbPath = getDbPath();
    const tmpPath = join(dirname(dbPath), `.restore-${Date.now()}.tmp.db`);
    const bakPath = `${dbPath}.bak-${Date.now()}`;
    try {
      writeFileSync(tmpPath, buf);
      // 1) valida o arquivo subido de forma isolada (sem tocar no banco atual)
      const probe = new DatabaseSync(tmpPath);
      let check: { integrity_check: string };
      let missing: string[] = [];
      try {
        check = probe.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
        // D1-2: além da integridade, exige as tabelas mínimas de um backup do Satoshii
        // (rejeita qualquer .sqlite arbitrário que não seja do app).
        const tableRows = probe
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>;
        const tables = new Set(tableRows.map((r) => r.name));
        const requiredTables = ["orders", "products", "users"];
        missing = requiredTables.filter((t) => !tables.has(t));
      } finally {
        probe.close();
      }
      if (!check || check.integrity_check !== "ok") {
        res.status(400).json({ error: "Arquivo SQLite inválido (integridade falhou)." });
        return;
      }
      if (missing.length > 0) {
        res.status(400).json({
          error: `Arquivo não parece ser um backup válido do Satoshii (tabelas ausentes: ${missing.join(", ")}).`,
        });
        return;
      }
      // 2) preserva o arquivo atual, fecha a conexão (checkpoint + remove WAL/shm) e substitui
      closeDb();
      if (existsSync(dbPath)) renameSync(dbPath, bakPath);
      copyFileSync(tmpPath, dbPath);
      openDb(); // reabre no arquivo novo; migrações idempotentes garantem o boot
      db.prepare("SELECT COUNT(*) FROM sqlite_master").get(); // sanity check pós-reabertura
    } catch (err) {
      console.error("[restore] falha ao restaurar, revertendo:", err);
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      if (existsSync(bakPath)) {
        try {
          if (existsSync(dbPath)) unlinkSync(dbPath);
          renameSync(bakPath, dbPath);
        } catch {
          /* ignore */
        }
      }
      try {
        openDb();
      } catch (e2) {
        console.error("[restore] falha ao reabrir o banco original:", e2);
      }
      res.status(500).json({ error: "Falha ao restaurar o backup. O banco original foi preservado." });
      return;
    }
    // limpeza dos temporários
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    if (existsSync(bakPath)) {
      try {
        unlinkSync(bakPath);
      } catch {
        /* ignore */
      }
    }
    // banco restaurado pode não ter admin → garante acesso ao painel (D1-1):
    // quando um admin é criado, devolve a senha em texto puro na resposta.
    let adminEnsured = true;
    let adminPassword: string | undefined;
    if (!findUserByUsername("admin")) {
      const seeded = await seedAdmin();
      adminEnsured = seeded !== false;
      if (typeof seeded === "string") adminPassword = seeded;
    }
    // D1-1 (lockout): o banco restaurado não conhece a sessão do operador atual.
    // Reinsere o token do header para o admin logado não ser desconectado.
    const bearer = String(req.headers.authorization ?? "");
    const token = bearer.startsWith("Bearer ") ? bearer.slice("Bearer ".length).trim() : "";
    if (token) {
      try {
        createSession(token, (req as AuthRequest).user.id, Date.now() + SESSION_MS);
      } catch (e) {
        // sessão não reinserida (ex.: operador inexistente no backup) → o
        // adminPassword (quando houve criação) ou o login manual garante o acesso
        console.error("[restore] falha ao reinserir a sessão do operador:", e);
      }
    }
    logAdminAction(req, "backup.restore", "backup", null, { bytes: buf.length, adminEnsured });
    res.json({
      ok: true,
      restoredAt: new Date().toISOString(),
      adminEnsured,
      ...(adminPassword !== undefined ? { adminPassword } : {}),
    });
  },
);

/* ---------- A2b — ações em lote ---------- */

/** POST /orders/batch-status — aplica o MESMO caminho do PATCH /:id/status por id.
 *  status ∈ approved|cancelled; transições inválidas são puladas (não abortam o lote). */
app.post("/api/admin/orders/batch-status", auth, requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
  const status = String(b.status ?? "");
  if (status !== "approved" && status !== "cancelled") {
    res.status(400).json({ error: "Status inválido. Use 'approved' ou 'cancelled'." });
    return;
  }
  if (ids.length === 0) {
    res.status(400).json({ error: "Informe ao menos um id de pedido." });
    return;
  }
  const skipped: Array<{ id: string; reason: string }> = [];
  let applied = 0;
  for (const id of ids) {
    const order = getOrderById(id);
    if (!order) {
      skipped.push({ id, reason: "Pedido não encontrado." });
      continue;
    }
    if (status === "approved") {
      if (order.status === "cancelled") {
        skipped.push({ id, reason: "Pedido já cancelado." });
        continue;
      }
      if (order.status === "delivered") {
        skipped.push({ id, reason: "Pedido já entregue." });
        continue;
      }
      if (order.payment_status === "approved" || order.delivery_mode !== "manual") {
        skipped.push({ id, reason: "Aprovação manual só é permitida para pedidos manual com pagamento pendente." });
        continue;
      }
      logAdminAction(req, "order.status", "order", id, { from: order.status, to: status });
      markOrderPaid(order.id, adminActor(req));
      updateOrderStatus(order.id, "approved", null);
    } else {
      // cancelled — mesma regra do PATCH (delivered também pode ser cancelado = refund)
      if (order.status === "cancelled") {
        skipped.push({ id, reason: "Pedido já cancelado." });
        continue;
      }
      logAdminAction(req, "order.status", "order", id, { from: order.status, to: status });
      const wasDelivered = order.status === "delivered";
      markOrderCancelled(order.id, adminActor(req));
      // C2-1: refund pós-entrega em lote também marca payment_status='refunded'
      if (wasDelivered) {
        updatePaymentStatus(order.id, "refunded");
      }
    }
    applied++;
  }
  res.json({ applied, skipped });
});

/* ---------- Fase A — fundação da suite admin (logs/settings/events/summary/reports) ---------- */

/* Resumo de contas por produto (total/disponíveis/usadas) + nome do produto. */
app.get("/api/admin/accounts/summary", auth, requireAdmin, (_req, res) => {
  const counts = accountCountsByProduct();
  res.json({
    items: counts.map((c) => ({
      productSlug: c.productSlug,
      name: getProductBySlug(c.productSlug)?.name ?? c.productSlug,
      total: c.total,
      available: c.available,
      used: c.used,
    })),
  });
});

/* Logs de ações do admin, paginados, com filtro opcional por action. */
app.get("/api/admin/logs", auth, requireAdmin, (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const page = Number(q.page ?? 1);
  const limit = Number(q.limit ?? 50);
  const { items, total, page: p, limit: l } = listActivityLogs({ page, limit, action: q.action });
  res.json({
    items: items.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      adminUsername: r.admin_id ? findUserById(r.admin_id)?.username ?? null : null,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: r.details,
      ip: r.ip,
      createdAt: r.created_at,
    })),
    total,
    page: p,
    limit: l,
  });
});

/* Settings — GET retorna todas (chave→valor); PUT faz upsert em lote e retorna o estado novo. */
app.get("/api/admin/settings", auth, requireAdmin, (_req, res) => {
  res.json({ settings: getAllSettings() });
});

app.put("/api/admin/settings", auth, requireAdmin, (req, res) => {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "Body inválido. Envie um objeto { chave: valor }." });
    return;
  }
  const updated = setSettings(body as Record<string, unknown>);
  logAdminAction(req, "settings.update", "settings", null, { keys: Object.keys(body) });
  res.json({ settings: updated });
});

/* Timeline de eventos de um pedido (order_events), ordenada crescente. */
app.get("/api/admin/orders/:id/events", auth, requireAdmin, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  res.json({
    events: listOrderEvents(order.id).map((e) => ({
      id: e.id,
      orderId: e.order_id,
      event: e.event,
      actorType: e.actor_type,
      actorId: e.actor_id,
      details: e.details,
      createdAt: e.created_at,
    })),
  });
});

/* ---------- relatórios (dashboard admin) ---------- */

app.get("/api/admin/reports/overview", auth, requireAdmin, (_req, res) => {
  res.json({ overview: getReportsOverview() });
});

app.get("/api/admin/reports/sales", auth, requireAdmin, (req, res) => {
  const period = String(req.query.period ?? "day");
  const safe: "day" | "week" | "month" = period === "week" || period === "month" ? period : "day";
  res.json({ period: safe, series: getSalesSeries(safe) });
});

app.get("/api/admin/reports/top-products", auth, requireAdmin, (req, res) => {
  const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit ?? 10))));
  res.json({ items: getTopProducts(limit) });
});

app.get("/api/admin/reports/top-customers", auth, requireAdmin, (req, res) => {
  const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit ?? 10))));
  res.json({ items: getTopCustomers(limit) });
});

app.post("/api/products", auth, requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const slug = slugify(String(b.slug && String(b.slug).trim() ? b.slug : b.name ?? ""));
  if (!SLUG_RE.test(slug)) {
    res.status(400).json({ error: "Slug inválido. Use apenas letras minúsculas, números e hífens." });
    return;
  }
  if (getProductBySlug(slug)) {
    res.status(409).json({ error: "Já existe um produto com este slug." });
    return;
  }
  if (String(b.name ?? "").trim().length < 3) {
    res.status(400).json({ error: "Nome precisa de pelo menos 3 letras." });
    return;
  }
  if (typeof b.price !== "number" || !Number.isFinite(b.price) || b.price <= 0) {
    res.status(400).json({ error: "Preço inválido." });
    return;
  }
  if (!getCategoryById(String(b.categoryId ?? ""))) {
    res.status(400).json({ error: "Categoria inválida." });
    return;
  }
  if (!String(b.emoji ?? "").trim() || !String(b.hueA ?? "").trim() || !String(b.hueB ?? "").trim()) {
    res.status(400).json({ error: "Emoji e cores são obrigatórios." });
    return;
  }
  if (b.maxQty !== undefined && b.maxQty !== null && b.maxQty !== "") {
    const mq = Number(b.maxQty);
    if (!Number.isFinite(mq) || mq < 1) {
      res.status(400).json({ error: "maxQty deve ser um inteiro maior que zero." });
      return;
    }
  }

  const row: ProductRow = {
    slug,
    name: String(b.name).trim(),
    tagline: String(b.tagline ?? "").trim(),
    description: String(b.description ?? "").trim(),
    price: Number(b.price),
    old_price: typeof b.oldPrice === "number" && b.oldPrice > b.price ? b.oldPrice : null,
    category_id: String(b.categoryId),
    emoji: String(b.emoji).trim(),
    hue_a: String(b.hueA).trim(),
    hue_b: String(b.hueB).trim(),
    badges: JSON.stringify(Array.isArray(b.badges) ? b.badges : []),
    rating: typeof b.rating === "number" ? Math.min(5, Math.max(0, b.rating)) : 4.5,
    reviews: typeof b.reviews === "number" ? Math.max(0, Math.floor(b.reviews)) : 0,
    stock: typeof b.stock === "number" ? Math.max(0, Math.floor(b.stock)) : 0,
    delivery_mode: normalizeDeliveryMode(b.deliveryMode),
    featured: Boolean(b.featured) ? 1 : 0,
    // Fase D — produto completo
    sku: b.sku !== undefined && b.sku !== null && String(b.sku).trim() ? String(b.sku).trim() : null,
    tags: JSON.stringify(Array.isArray(b.tags) ? b.tags.map(String) : []),
    banner: b.banner !== undefined && b.banner !== null && String(b.banner).trim() ? String(b.banner).trim() : null,
    active: toBool(b.active, true) ? 1 : 0,
    max_qty:
      b.maxQty === undefined || b.maxQty === null || b.maxQty === ""
        ? null
        : Math.max(1, Math.floor(Number(b.maxQty))),
    unlimited_stock: toBool(b.unlimitedStock, false) ? 1 : 0,
    hide_when_zero: toBool(b.hideWhenZero, false) ? 1 : 0,
    extras: JSON.stringify(Array.isArray(b.extras) ? b.extras : []),
    faq: JSON.stringify(Array.isArray(b.faq) ? b.faq : []),
    garantia: b.garantia !== undefined && b.garantia !== null && String(b.garantia).trim()
      ? String(b.garantia).trim()
      : null,
    termos: b.termos !== undefined && b.termos !== null && String(b.termos).trim()
      ? String(b.termos).trim()
      : null,
    image_urls: JSON.stringify(
      Array.isArray(b.imageUrls) ? b.imageUrls.filter((x: unknown) => typeof x === "string") : [],
    ),
  };
  if (row.delivery_mode === "manual") row.unlimited_stock = 1;
  if (row.delivery_mode === "auto" || row.delivery_mode === "adm") row.unlimited_stock = 0;
  insertProduct(row);
  logAdminAction(req, "product.create", "product", slug);
  res.status(201).json({ product: serializeProduct(row) });
});

app.patch("/api/products/:slug", auth, requireAdmin, (req, res) => {
  const existing = getProductBySlug(req.params.slug);
  if (!existing) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  const b = req.body ?? {};

  if (b.name !== undefined && String(b.name).trim().length < 3) {
    res.status(400).json({ error: "Nome precisa de pelo menos 3 letras." });
    return;
  }
  if (b.price !== undefined && (typeof b.price !== "number" || !Number.isFinite(b.price) || b.price <= 0)) {
    res.status(400).json({ error: "Preço inválido." });
    return;
  }
  if (b.categoryId !== undefined && !getCategoryById(String(b.categoryId))) {
    res.status(400).json({ error: "Categoria inválida." });
    return;
  }
  if (b.rating !== undefined && (typeof b.rating !== "number" || b.rating < 0 || b.rating > 5)) {
    res.status(400).json({ error: "Avaliação deve estar entre 0 e 5." });
    return;
  }
  if (b.stock !== undefined && (typeof b.stock !== "number" || b.stock < 0)) {
    res.status(400).json({ error: "Estoque inválido." });
    return;
  }
  if (b.maxQty !== undefined && b.maxQty !== null && b.maxQty !== "") {
    const mq = Number(b.maxQty);
    if (!Number.isFinite(mq) || mq < 1) {
      res.status(400).json({ error: "maxQty deve ser um inteiro maior que zero." });
      return;
    }
  }

  const prevStock = existing.stock;
  const row: ProductRow = {
    slug: existing.slug,
    name: b.name !== undefined ? String(b.name).trim() : existing.name,
    tagline: b.tagline !== undefined ? String(b.tagline).trim() : existing.tagline,
    description: b.description !== undefined ? String(b.description).trim() : existing.description,
    price: b.price !== undefined ? Number(b.price) : existing.price,
    old_price:
      b.oldPrice !== undefined
        ? typeof b.oldPrice === "number" && b.oldPrice > (b.price ?? existing.price)
          ? b.oldPrice
          : null
        : existing.old_price,
    category_id: b.categoryId !== undefined ? String(b.categoryId) : existing.category_id,
    emoji: b.emoji !== undefined ? String(b.emoji).trim() : existing.emoji,
    hue_a: b.hueA !== undefined ? String(b.hueA).trim() : existing.hue_a,
    hue_b: b.hueB !== undefined ? String(b.hueB).trim() : existing.hue_b,
    badges: b.badges !== undefined ? JSON.stringify(b.badges) : existing.badges,
    rating: b.rating !== undefined ? Number(b.rating) : existing.rating,
    reviews: b.reviews !== undefined ? Math.max(0, Math.floor(Number(b.reviews))) : existing.reviews,
    stock: b.stock !== undefined ? Math.max(0, Math.floor(Number(b.stock))) : existing.stock,
    delivery_mode:
      b.deliveryMode !== undefined ? normalizeDeliveryMode(b.deliveryMode) : existing.delivery_mode,
    featured: b.featured !== undefined ? (Boolean(b.featured) ? 1 : 0) : existing.featured,
    // Fase D — produto completo
    sku: b.sku !== undefined ? (String(b.sku).trim() || null) : existing.sku,
    tags: b.tags !== undefined ? JSON.stringify(Array.isArray(b.tags) ? b.tags.map(String) : []) : existing.tags,
    banner: b.banner !== undefined ? (String(b.banner).trim() || null) : existing.banner,
    active: b.active !== undefined ? (toBool(b.active) ? 1 : 0) : existing.active,
    max_qty:
      b.maxQty !== undefined
        ? b.maxQty === null || b.maxQty === ""
          ? null
          : Math.max(1, Math.floor(Number(b.maxQty)))
        : existing.max_qty,
    unlimited_stock:
      b.unlimitedStock !== undefined ? (toBool(b.unlimitedStock) ? 1 : 0) : existing.unlimited_stock,
    hide_when_zero:
      b.hideWhenZero !== undefined ? (toBool(b.hideWhenZero) ? 1 : 0) : existing.hide_when_zero,
    extras: b.extras !== undefined ? JSON.stringify(Array.isArray(b.extras) ? b.extras : []) : existing.extras,
    faq: b.faq !== undefined ? JSON.stringify(Array.isArray(b.faq) ? b.faq : []) : existing.faq,
    garantia: b.garantia !== undefined ? (String(b.garantia).trim() || null) : existing.garantia,
    termos: b.termos !== undefined ? (String(b.termos).trim() || null) : existing.termos,
    image_urls:
      b.imageUrls !== undefined
        ? JSON.stringify(Array.isArray(b.imageUrls) ? b.imageUrls.filter((x: unknown) => typeof x === "string") : [])
        : existing.image_urls,
  };
  if (row.delivery_mode === "manual") row.unlimited_stock = 1;
  if (row.delivery_mode === "auto" || row.delivery_mode === "adm") row.unlimited_stock = 0;
  updateProduct(existing.slug, row);
  // Fase D — ledger de estoque: alteração manual de stock gera movimento "set"
  if (b.stock !== undefined && row.stock !== prevStock) {
    logMovement({
      productSlug: existing.slug,
      kind: "stock",
      action: "set",
      qty: row.stock,
      note: `Admin: ${prevStock} → ${row.stock}`,
    });
  }
  logAdminAction(req, "product.update", "product", existing.slug);
  res.json({ product: serializeProduct(row) });
});

app.delete("/api/products/:slug", auth, requireAdmin, (req, res) => {
  if (!getProductBySlug(req.params.slug)) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }
  deleteProduct(req.params.slug);
  logAdminAction(req, "product.delete", "product", req.params.slug);
  res.json({ ok: true });
});

/* ---------- alertas de estoque/contas (Fase D) ---------- */

/** Alertas do catálogo: lowStock, outOfStock, lowAccounts e inactive.
 *  Threshold lido da setting low_stock_threshold (default 5). */
app.get("/api/admin/alerts", auth, requireAdmin, (_req, res) => {
  const rawThreshold = getAllSettings()["low_stock_threshold"] ?? "5";
  const threshold = Math.max(1, Math.floor(Number(rawThreshold)) || 5);
  res.json({ alerts: getStockAlerts(threshold), threshold });
});

app.post("/api/categories", auth, requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const id = String(b.id ?? "").trim();
  if (!CATEGORY_ID_RE.test(id)) {
    res.status(400).json({ error: "Id inválido. Use apenas letras minúsculas, números e hífens." });
    return;
  }
  if (getCategoryById(id)) {
    res.status(409).json({ error: "Já existe uma categoria com este id." });
    return;
  }
  if (String(b.name ?? "").trim().length < 2) {
    res.status(400).json({ error: "Nome precisa de pelo menos 2 letras." });
    return;
  }

  insertCategory({
    id,
    name: String(b.name).trim(),
    icon_key: String(b.iconKey ?? "Puzzle").trim() || "Puzzle",
    emoji: String(b.emoji ?? "✨").trim(),
    color: String(b.color ?? "#ffffff").trim(),
    gradient: String(b.gradient ?? "").trim(),
    blurb: String(b.blurb ?? "").trim(),
  });
  const row = getCategoryById(id)!;
  logAdminAction(req, "category.create", "category", id);
  res.status(201).json({ category: serializeCategory(row) });
});

app.patch("/api/categories/:id", auth, requireAdmin, (req, res) => {
  const existing = getCategoryById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }
  const b = req.body ?? {};
  if (b.name !== undefined && String(b.name).trim().length < 2) {
    res.status(400).json({ error: "Nome precisa de pelo menos 2 letras." });
    return;
  }

  updateCategory(existing.id, {
    id: existing.id,
    name: b.name !== undefined ? String(b.name).trim() : existing.name,
    icon_key: b.iconKey !== undefined ? String(b.iconKey).trim() : existing.icon_key,
    emoji: b.emoji !== undefined ? String(b.emoji).trim() : existing.emoji,
    color: b.color !== undefined ? String(b.color).trim() : existing.color,
    gradient: b.gradient !== undefined ? String(b.gradient).trim() : existing.gradient,
    blurb: b.blurb !== undefined ? String(b.blurb).trim() : existing.blurb,
  });
  const row = getCategoryById(existing.id)!;
  logAdminAction(req, "category.update", "category", existing.id);
  res.json({ category: serializeCategory(row) });
});

app.delete("/api/categories/:id", auth, requireAdmin, (req, res) => {
  if (!getCategoryById(req.params.id)) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }
  const inUse = db.prepare("SELECT 1 FROM products WHERE category_id = ?").get(req.params.id);
  if (inUse) {
    res.status(409).json({ error: "Não é possível excluir: existem produtos nesta categoria." });
    return;
  }
  deleteCategory(req.params.id);
  logAdminAction(req, "category.delete", "category", req.params.id);
  res.json({ ok: true });
});

/* ---------- newsletter ---------- */

app.post("/api/subscribers", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "E-mail inválido." });
    return;
  }

  const duplicate = Boolean(db.prepare("SELECT 1 FROM subscribers WHERE email = ?").get(email));
  addSubscriber(email, new Date().toISOString());
  res.status(duplicate ? 200 : 201).json({ ok: true, duplicate });
});

/* ---------- static serve (produção) ---------- */

const distDir = join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  // index.html sempre revalidado (nunca fica com bundle velho em cache);
  // assets com hash podem ser cacheados de forma agressiva pelo navegador.
  const noCacheHtml = (res: ServerResponse) => res.setHeader("Cache-Control", "no-cache");
  app.use(
    express.static(distDir, {
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) noCacheHtml(res);
      },
    }),
  );
  // SPA fallback — compatível com Express 5 (sem "*").
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      noCacheHtml(res);
      res.sendFile(join(distDir, "index.html"));
      return;
    }
    next();
  });
}

// Seed idempotente (só insere se as tabelas estiverem vazias). Em cold starts
// da Vercel roda a cada invocação nova — se falhar (tabelas ainda não criadas),
// não pode derrubar a função: loga e segue (as rotas respondem 500 com a causa).
try {
  seedCatalog();
  await seedAdmin();
} catch (err) {
  console.error(
    "[server] Falha no seed inicial (rodou o supabase-migration.sql no Supabase?):",
    err instanceof Error ? err.message : err,
  );
}

/* ---------- handler de erro global — nunca devolver HTML de exceção ---------- */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] erro não tratado:", err);
  if (res.headersSent) return; // resposta já começou — deixa o Express encerrar
  // Erros do multer (upload de imagens): tipo não suportado / tamanho excedido → 400.
  const multerErr = err as { name?: string; code?: string; message?: string };
  const isMulterError =
    multerErr?.name === "MulterError" ||
    multerErr?.code === "LIMIT_FILE_SIZE" ||
    multerErr?.message === "Tipo de arquivo não suportado.";
  if (isMulterError) {
    const message =
      multerErr.code === "LIMIT_FILE_SIZE"
        ? "Arquivo muito grande. Limite de 5MB por imagem."
        : multerErr.message || "Falha no upload da imagem.";
    res.status(400).json({ error: message });
    return;
  }
  const e = err as { status?: unknown; statusCode?: unknown };
  const status =
    typeof e.status === "number" ? e.status :
    typeof e.statusCode === "number" ? e.statusCode :
    500;
  if (status >= 400 && status < 500) {
    // erros de requisição (ex: JSON malformado/limit excedido do body-parser)
    res.status(status).json({ error: "Requisição inválida." });
  } else {
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

if (process.env.VERCEL) {
  // Deploy Vercel: a função serverless (api/index.ts) exporta o app; aqui não
  // há listen — a plataforma chama o handler a cada request.
  console.log("[server] Modo Vercel — app exportado sem listen.");
} else {
  app.listen(PORT, () => {
    console.log(`SATOSHII STORE API rodando em http://localhost:${PORT}`);
  });
}

export default app;
