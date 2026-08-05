import { randomBytes, randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { generateFakeAccount } from "../src/lib/fake-account.ts";
import {
  claimAccount,
  decrementCouponUses,
  decrementStock,
  getOrderById,
  getProductBySlug,
  insertAccount,
  insertOrderEvent,
  insertProcessedPayment,
  isPaymentProcessed,
  logMovement,
  releaseAccountsByOrder,
  restoreStock,
  setOrderNeedsManual,
  updateOrderStatus,
  updateOrderStockDecrement,
  updatePaymentStatus,
  type AccountRow,
} from "./db.ts";

/* ============================================================
   MP — Pagamentos via Mercado Pago (PIX), fetch nativo (sem SDK).
   PAYMENTS_MODE=simulation (default) | live
   Em simulation, gera QR mock e não chama o Mercado Pago.
   ============================================================ */

export interface MpConfig {
  mode: "simulation" | "live";
  accessToken: string;
  webhookSecret: string;
}

let cachedConfig: MpConfig | null = null;

/** Lê a config de pagamentos do env. Live sem token/secret → erro (fail-fast no boot). */
export function getMpConfig(): MpConfig {
  if (cachedConfig) return cachedConfig;
  const mode = process.env.PAYMENTS_MODE === "live" ? "live" : "simulation";
  const accessToken = process.env.MP_ACCESS_TOKEN ?? "";
  const webhookSecret = process.env.MP_WEBHOOK_SECRET ?? "";
  if (mode === "live" && !accessToken) {
    throw new Error("PAYMENTS_MODE=live exige MP_ACCESS_TOKEN definido no .env");
  }
  cachedConfig = { mode, accessToken, webhookSecret };
  return cachedConfig;
}

const PIX_TTL_MS = 45 * 60 * 1000; // 45 min

export interface PixPaymentResult {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: number;
}

/** ISO 8601 UTC (com Z) para date_of_expiration do MP — formato aceito pela API. */
function isoOffset(ms: number): string {
  return new Date(ms).toISOString();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Cria um pagamento PIX. Em simulation gera QR mock; em live chama o MP. */
export async function createPixPayment(opts: {
  amount: number;
  description: string;
  payerEmail: string;
  payerCpf: string;
  externalRef: string;
  notificationUrl: string;
}): Promise<PixPaymentResult> {
  const config = getMpConfig();
  const expiresAt = Date.now() + PIX_TTL_MS;

  if (config.mode === "simulation") {
    const paymentId = `sim_${randomBytes(6).toString("hex")}`;
    const ref = paymentId.replace("sim_", "SIM").slice(0, 12);
    const amountDigits = opts.amount.toFixed(2).replace(".", "");
    const qrCode =
      `00020126580014BR.GOV.BCB.PIX0136${ref}` +
      `520400005303986540${amountDigits}5802BR5913SATOSHII STOR6009SAO PAULO62070503***6304A1B2`;
    return { paymentId, qrCode, qrCodeBase64: null, ticketUrl: null, expiresAt };
  }

  // ---- live ----
  const body: Record<string, unknown> = {
    transaction_amount: Number(opts.amount),
    description: opts.description,
    payment_method_id: "pix",
    payer: {
      email: opts.payerEmail,
      identification: { type: "CPF", number: opts.payerCpf },
    },
    external_reference: opts.externalRef,
    date_of_expiration: isoOffset(expiresAt),
  };
  // Só inclui notification_url se for uma URL pública válida (o MP rejeita localhost).
  if (opts.notificationUrl && /^https?:\/\/[^/]+/.test(opts.notificationUrl)) {
    body.notification_url = opts.notificationUrl;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(body),
    }, 10_000);
  } catch {
    throw new Error("Falha ao conectar com o Mercado Pago. Tente novamente em instantes.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const d = (await res.json()) as { message?: string };
      if (d.message) detail = `: ${d.message}`;
    } catch {
      // corpo não-JSON — mantém a mensagem genérica
    }
    throw new Error(`Não foi possível gerar o PIX no Mercado Pago${detail}.`);
  }
  const data = (await res.json()) as {
    id?: number | string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
  };
  const td = data.point_of_interaction?.transaction_data ?? {};
  return {
    paymentId: String(data.id ?? ""),
    qrCode: String(td.qr_code ?? ""),
    qrCodeBase64: td.qr_code_base64 ? String(td.qr_code_base64) : null,
    ticketUrl: td.ticket_url ? String(td.ticket_url) : null,
    expiresAt,
  };
}

/** Consulta o status de um pagamento no MP. Simulation → sempre 'pending'. */
export async function getPaymentStatus(paymentId: string): Promise<string> {
  const config = getMpConfig();
  if (config.mode === "simulation" || String(paymentId).startsWith("sim_")) {
    return "pending";
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { method: "GET", headers: { Authorization: `Bearer ${config.accessToken}` } },
      10_000,
    );
  } catch {
    throw new Error("Falha ao consultar pagamento no Mercado Pago.");
  }
  if (!res.ok) {
    throw new Error(`Falha ao consultar pagamento (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { status?: string };
  return String(data.status ?? "pending");
}

/** Estorna um pagamento no Mercado Pago (C2-2). Simulation → no-op (sem HTTP).
 *  Live → POST /v1/payments/:id/refunds com X-Idempotency-Key. Lança erro em
 *  falha de rede, 404 (pagamento inexistente) ou 400 (body inválido). */
export async function refundPayment(paymentId: string): Promise<void> {
  const config = getMpConfig();
  if (config.mode === "simulation" || String(paymentId).startsWith("sim_")) {
    return;
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({}),
      },
      10_000,
    );
  } catch {
    throw new Error("Falha ao conectar com o Mercado Pago para estornar o pagamento.");
  }
  if (!res.ok) {
    throw new Error(`Falha ao estornar o pagamento no Mercado Pago (HTTP ${res.status}).`);
  }
}

/** Valida a assinatura do webhook do MP (x-signature + x-request-id + data.id da query).
 *  Em simulation retorna true. Em live sem secret → fail-closed (false). */
export function verifyWebhookSignature(req: Request): boolean {
  const config = getMpConfig();
  if (config.mode === "simulation") return true;
  if (!config.webhookSecret) return false; // fail-closed

  const signatureHeader = String(req.headers["x-signature"] ?? "");
  const xRequestId = String(req.headers["x-request-id"] ?? "");
  const q = req.query as Record<string, unknown>;
  const nested = q.data as { id?: unknown } | undefined;
  const dataId = String(nested?.id ?? q["data.id"] ?? "");

  const tsMatch = /(?:^|,)\s*ts=(\d+)/.exec(signatureHeader);
  const v1Match = /(?:^|,)\s*v1=([0-9a-fA-F]+)/.exec(signatureHeader);
  if (!tsMatch || !v1Match || !dataId || !xRequestId) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${tsMatch[1]};`;
  const expected = Buffer.from(v1Match[1], "hex");
  const actual = createHmac("sha256", config.webhookSecret).update(manifest).digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ---------- transações (Supabase: RPCs atômicas; sem BEGIN/COMMIT explícitos) ---------- */

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

/** Ator de um evento de pedido (para order_events). Default: system. */
export interface OrderEventActor {
  type: "system" | "admin" | "user" | "webhook";
  id?: string | null;
}

/** ÚNICA porta de saída de 'pending' por confirmação de pagamento.
 *  Decrementa stock, seta payment_status='approved' e deriva a entrega pelo
 *  delivery_mode do pedido. Idempotente via processed_payments. */
export async function markOrderPaid(orderId: string, actor: OrderEventActor = { type: "system", id: null }): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status === "delivered" || order.status === "cancelled") {
      return;
    }
    if (order.payment_status === "expired") {
      return;
    }
    if (order.payment_id && (await isPaymentProcessed(order.payment_id))) {
      return; // já processado — não entregar 2x
    }

    // 1) decrementa stock (1 por unidade; se faltar, sinaliza needs_manual)
    const items = JSON.parse(order.items_json || "[]") as Array<{ productId: string; qty: number }>;
    let stockOk = true;
    const decremented: Record<string, number> = {};
    for (const it of items) {
      const qty = Math.max(1, Math.floor(Number(it?.qty) || 1));
      // D-P1-1: produto com estoque ilimitado NÃO é decrementado e NÃO conta como
      // falha de estoque. O ledger grava {slug: 0} → o refund não restaura nada
      // indevido. stockOk permanece true → não cai na fila "necessita ação manual".
      const product = await getProductBySlug(it.productId);
      if (product?.unlimited_stock === 1 || product?.delivery_mode === "auto" || product?.delivery_mode === "adm") {
        // manual/auto/adm: o estoque NÃO é a coluna stock — manual é infinito e
        // auto/adm é controlado pelas contas (claim). Nada a decrementar aqui.
        decremented[it.productId] = 0;
        continue;
      }
      let ok = 0;
      for (let i = 0; i < qty; i++) {
        const success = await decrementStock(it.productId);
        if (success) ok++;
        else stockOk = false;
      }
      decremented[it.productId] = ok;
      // Fase D — ledger de estoque: venda decrementa (sale -n)
      if (ok > 0) {
        await logMovement({
          productSlug: it.productId,
          kind: "stock",
          action: "sale",
          qty: -ok,
          note: `Pedido ${order.id}`,
        });
      }
    }
    // persiste o quanto foi realmente decrementado (restore exato no cancel/refund)
    await updateOrderStockDecrement(order.id, JSON.stringify(decremented));

    // 2) pagamento aprovado
    await updatePaymentStatus(order.id, "approved");

    const mode = order.delivery_mode ?? "manual";
    let needsManual = !stockOk;

    await insertOrderEvent({
      orderId: order.id,
      event: "payment_approved",
      actorType: actor.type,
      actorId: actor.id ?? null,
      details: JSON.stringify({ paymentId: order.payment_id ?? null, mode }),
    });

    if (mode === "auto") {
      // 3) claim de 1 conta por unidade; se todas conseguirem → entrega automática
      let totalUnits = 0;
      const claimLines: string[] = [];
      for (const it of items) {
        const qty = Math.max(1, Math.floor(Number(it?.qty) || 1));
        totalUnits += qty;
        for (let u = 0; u < qty; u++) {
          const acc = await claimAccount(it.productId, order.id);
          if (acc) {
            claimLines.push(`• ${it.productId}: e-mail ${acc.email} — senha: ${acc.password}`);
            // Fase D — ledger de contas: claim de 1 conta por unidade vendida
            await logMovement({
              productSlug: it.productId,
              kind: "account",
              action: "claim",
              qty: 1,
              note: `Pedido ${order.id}`,
            });
          }
        }
      }
      if (totalUnits > 0 && claimLines.length === totalUnits) {
        await insertOrderEvent({
          orderId: order.id,
          event: "delivery_started",
          actorType: actor.type,
          actorId: actor.id ?? null,
          details: JSON.stringify({ automatic: true }),
        });
        await updateOrderStatus(order.id, "delivered", JSON.stringify({ message: claimLines.join("\n"), automatic: true }));
        await insertOrderEvent({
          orderId: order.id,
          event: "delivered",
          actorType: actor.type,
          actorId: actor.id ?? null,
          details: JSON.stringify({ automatic: true }),
        });
      } else {
        // fallback adm: converte para approved + needs_manual (converge no fluxo do admin)
        await updateOrderStatus(order.id, "approved", null);
        needsManual = true;
      }
    } else if (mode === "adm") {
      // notifica (ordenação do admin) e aguarda entrega manual do ADM
      await updateOrderStatus(order.id, "approved", null);
    }
    // manual: status continua 'pending' — o ADM decide via PATCH

    if (needsManual) {
      await setOrderNeedsManual(order.id, 1);
      await insertOrderEvent({
        orderId: order.id,
        event: "needs_manual",
        actorType: actor.type,
        actorId: actor.id ?? null,
        details: JSON.stringify({ reason: stockOk ? "sem contas disponíveis" : "estoque insuficiente" }),
      });
    }

    // 4) dedupe
    if (order.payment_id) {
      await insertProcessedPayment(order.payment_id, order.id, "approved");
    }
  } catch (err) {
    throw err;
  }
}

/** Cancela um pedido e reverte stock/contas se o pagamento já havia sido processado.
 *  Também trata refund/charged_back pós-entrega: pedidos delivered também devolvem
 *  a conta claimada (used=0/order_id=NULL) e restauram o stock via ledger. */
export async function markOrderCancelled(orderId: string, actor: OrderEventActor = { type: "system", id: null }): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status === "cancelled") {
      return;
    }
    const wasDelivered = order.status === "delivered";
    const wasProcessed = Boolean(order.payment_id && (await isPaymentProcessed(order.payment_id)));
    if (wasProcessed) {
      // devolve estoque (só o que foi realmente decrementado — ledger gravado no markOrderPaid)
      const items = JSON.parse(order.items_json || "[]") as Array<{ productId: string; qty: number }>;
      let ledger: Record<string, number> = {};
      try {
        ledger = JSON.parse(order.stock_decrement_json ?? "{}") as Record<string, number>;
      } catch {
        // ledger ausente/corrompido → fallback conservador: qty cheia (legado)
      }
      for (const it of items) {
        const qty = Math.max(1, Math.floor(Number(it?.qty) || 1));
        const restore = typeof ledger[it.productId] === "number" ? ledger[it.productId] : qty;
        if (restore > 0) {
          await restoreStock(it.productId, restore);
          // Fase D — ledger de estoque: cancelamento/refund devolve (refund +n)
          await logMovement({
            productSlug: it.productId,
            kind: "stock",
            action: "refund",
            qty: restore,
            note: `Pedido ${order.id}`,
          });
        }
      }
    }
    // C1-2: pedido cancelado que havia consumido um cupom devolve o uso (com
    // pagamento processado, o cupom foi efetivamente usado na compra).
    if (wasProcessed && order.coupon_code) {
      await decrementCouponUses(order.coupon_code);
    }
    // devolve contas claimadas por este pedido ao estoque
    const releasedByProduct = new Map<string, number>();
    const claimedByProduct = await releaseAccountsByOrder(order.id);
    for (const slug of claimedByProduct) {
      releasedByProduct.set(slug, (releasedByProduct.get(slug) ?? 0) + 1);
    }
    // Fase D — ledger de contas: devolução (release n por produto)
    for (const [slug, n] of releasedByProduct) {
      await logMovement({
        productSlug: slug,
        kind: "account",
        action: "release",
        qty: n,
        note: `Pedido ${order.id}`,
      });
    }
    await updateOrderStatus(order.id, "cancelled", order.delivery_json);
    await insertOrderEvent({
      orderId: order.id,
      event: wasDelivered ? "refunded" : "cancelled",
      actorType: actor.type,
      actorId: actor.id ?? null,
      details: JSON.stringify({ wasProcessed, wasDelivered }),
    });
  } catch (err) {
    throw err;
  }
}

/** Opções extras de entrega (usadas pelo redelivery admin). */
export interface DeliverOrderOptions {
  /** Redelivery: permite reentregar um pedido JÁ entregue — gera um NOVO
   *  delivery_json (message + timestamp + flag redelivery) e registra o evento
   *  `redelivered` (em vez de `delivered`/`delivery_started`). */
  redeliver?: boolean;
  /** Timestamp custom para o delivery_json (default: agora). */
  timestamp?: string;
}

/** Entrega manual: grava delivery_json + status 'delivered' (fluxo do AdminPage).
 *  Com `opts.redeliver` também reentregue pedidos delivered (nunca claima nova
 *  conta — conta única por venda, a claim é responsabilidade da rota admin). */
export async function deliverOrder(
  orderId: string,
  message: string,
  actor: OrderEventActor = { type: "system", id: null },
  opts: DeliverOrderOptions = {},
): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    if (!order) throw new Error("Pedido não encontrado");
    // cancelado nunca é (re)entregue; delivered só reentrega quando redeliver=true
    if (order.status === "cancelled" || (!opts.redeliver && order.status === "delivered")) {
      return;
    }
    const ts = opts.timestamp ?? new Date().toISOString();
    const deliveryJson = opts.redeliver
      ? JSON.stringify({ message, redeliveredAt: ts, redelivery: true })
      : JSON.stringify({ message });
    if (!opts.redeliver) {
      await insertOrderEvent({
        orderId: order.id,
        event: "delivery_started",
        actorType: actor.type,
        actorId: actor.id ?? null,
      });
    }
    await updateOrderStatus(order.id, "delivered", deliveryJson);
    await insertOrderEvent({
      orderId: order.id,
      event: opts.redeliver ? "redelivered" : "delivered",
      actorType: actor.type,
      actorId: actor.id ?? null,
      details: JSON.stringify(
        opts.redeliver
          ? { manual: true, redelivery: true, redeliveredAt: ts }
          : { manual: true },
      ),
    });
  } catch (err) {
    throw err;
  }
}

/* ---------- contas de estoque ---------- */

export async function createAccount(opts: {
  productSlug: string;
  email: string;
  password: string;
  emailPassword?: string;
  codigoExtra?: string;
  observacoes?: string;
}): Promise<AccountRow> {
  const product = await getProductBySlug(opts.productSlug);
  if (!product) throw new Error("Produto não encontrado");
  const row: AccountRow = {
    id: genId("acc"),
    product_slug: opts.productSlug,
    email: opts.email,
    password: opts.password,
    email_password: opts.emailPassword ?? null,
    codigo_extra: opts.codigoExtra ?? null,
    observacoes: opts.observacoes ?? null,
    used: 0,
    order_id: null,
    created_at: new Date().toISOString(),
  };
  await insertAccount(row);
  return row;
}

/** Gera N contas fake para o estoque (usa o gerador de src/lib/fake-account.ts). */
export async function generateAccounts(productSlug: string, count: number): Promise<AccountRow[]> {
  const product = await getProductBySlug(productSlug);
  if (!product) throw new Error("Produto não encontrado");
  const out: AccountRow[] = [];
  for (let i = 0; i < count; i++) {
    const fake = generateFakeAccount(product.name, "Cliente");
    out.push(await createAccount({ productSlug, email: fake.email, password: fake.password }));
  }
  return out;
}
