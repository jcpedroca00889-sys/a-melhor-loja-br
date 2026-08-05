import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Banknote, Check, Copy, QrCode, ShoppingBag, User } from "lucide-react";
import { getProductById } from "@/lib/db";
import { api } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { getLenis } from "@/lib/lenis";
import { useAuthStore, useUser } from "@/lib/store/auth-store";
import { useCartItems, useCartStore } from "@/lib/store/cart-store";
import { toast } from "@/lib/store/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ============================================================
   CHECKOUT — 2 etapas (identificação → pagamento PIX real).
   Ao avançar para o pagamento, o pedido é criado no servidor
   (POST /api/orders → Mercado Pago), exibimos o PIX gerado
   (QR / copia-e-cola), contamos o tempo de validade e fazemos
   polling do status até a confirmação/entrega.
   ============================================================ */

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

const checkoutSchema = z.object({
  name: z.string().min(3, "Informe seu nome completo"),
  email: z.string().min(1, "E-mail obrigatório").email("E-mail inválido"),
  phone: z.string().min(10, "WhatsApp incompleto — use DDD + número"),
  cpf: z
    .string()
    .refine((v) => {
      const d = v.replace(/\D/g, "");
      return d.length === 11;
    }, "CPF obrigatório — informe 11 dígitos")
    .refine((v) => {
      const d = v.replace(/\D/g, "");
      return !/^(\d)\1{10}$/.test(d);
    }, "CPF inválido")
    .refine((v) => isValidCpf(v.replace(/\D/g, "")), "CPF inválido"),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

const STEPS = [
  { id: 0, label: "Identificação", icon: User },
  { id: 1, label: "Pagamento", icon: QrCode },
] as const;

const STEP_FIELDS: Record<number, (keyof CheckoutForm)[]> = {
  0: ["name", "email", "phone", "cpf"],
  1: [],
};

/* Máscaras simples de entrada */
const maskDigits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/* Contratos do backend (/api/orders) */
interface CreateOrderResponse {
  id: string;
  createdAt: string;
  payment: {
    paymentId: string;
    qrCode: string;
    qrCodeBase64: string | null;
    ticketUrl: string | null;
    expiresAt: number;
  };
}

type OrderStatus = "pending" | "approved" | "delivered" | "cancelled";
type DeliveryMode = "auto" | "adm" | "manual";

interface SerializedOrder {
  id: string;
  status: OrderStatus;
  deliveryMode: DeliveryMode;
  delivery: { message: string } | null;
}

/* Linha congelada do resumo — sobrevive ao esvaziar o carrinho
   (o carrinho é limpo assim que o pedido é criado). */
interface OrderLine {
  productId: string;
  name: string;
  image: string;
  price: number;
  qty: number;
}

export default function CheckoutPage() {
  const items = useCartItems();
  const clearCart = useCartStore((s) => s.clearCart);
  const navigate = useNavigate();
  const user = useUser();
  const restoring = useAuthStore((s) => s.restoring);
  const token = useAuthStore((s) => s.token);

  const [step, setStep] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [payment, setPayment] = useState<CreateOrderResponse["payment"] | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode | null>(null);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      cpf: "",
    },
  });

  const rows = useMemo(
    () =>
      items.flatMap((item) => {
        const product = getProductById(item.productId);
        return product ? [{ item, product }] : [];
      }),
    [items],
  );

  /* Resumo: usa o snapshot do pedido quando o carrinho já foi limpo */
  const summaryLines: OrderLine[] =
    orderLines.length > 0
      ? orderLines
      : rows.map(({ item, product }) => ({
          productId: item.productId,
          name: product.name,
          image: product.images[0],
          price: product.price,
          qty: item.qty,
        }));
  const summaryTotal = summaryLines.reduce((s, l) => s + l.price * l.qty, 0);

  const done = orderStatus === "delivered";

  /* Contagem regressiva da validade do PIX (expiresAt vindo do POST) */
  const remainingSeconds = payment ? Math.max(0, Math.floor((payment.expiresAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!payment) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [payment]);

  useEffect(() => {
    if (payment && remainingSeconds <= 0 && orderStatus !== "delivered") setExpired(true);
  }, [payment, remainingSeconds, orderStatus]);

  /* Cria o pedido no servidor (gera o PIX no Mercado Pago).
     Reutilizável para "Gerar novo PIX" após expirar — por isso o
     snapshot de linhas e a idempotência quando orderId já existe. */
  const createOrder = async (): Promise<boolean> => {
    if (!token) {
      toast({
        title: "Faça login para finalizar",
        description: "Você precisa estar logado para que o pedido chegue ao admin.",
        variant: "error",
      });
      return false;
    }

    const lines: OrderLine[] =
      orderLines.length > 0
        ? orderLines
        : rows.map(({ item, product }) => ({
            productId: item.productId,
            name: product.name,
            image: product.images[0],
            price: product.price,
            qty: item.qty,
          }));
    if (orderLines.length === 0) setOrderLines(lines);

    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const data = getValues();
      const res = await api<CreateOrderResponse>("/orders", {
        method: "POST",
        token,
        body: JSON.stringify({
          customer: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            cpf: data.cpf.replace(/\D/g, ""),
          },
          items: lines.map(({ productId, qty }) => ({ productId, qty })),
        }),
      });

      setOrderId(res.id);
      setPayment(res.payment);
      setOrderStatus("pending");
      setExpired(false);
      setNow(Date.now());
      clearCart();
      getLenis()?.scrollTo(0, { duration: 0.6 });
      return true;
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Tente novamente em instantes.");
      return false;
    } finally {
      setPaymentLoading(false);
    }
  };

  const next = async () => {
    if (paymentLoading) return; // evita criar 2 pedidos no mesmo clique
    const valid = await trigger(STEP_FIELDS[step]);
    if (!valid) return;
    if (step === 0 && !orderId) {
      const ok = await createOrder();
      if (!ok) return;
    }
    setStep((s) => Math.min(1, s + 1));
    getLenis()?.scrollTo(0, { duration: 0.6 });
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    getLenis()?.scrollTo(0, { duration: 0.6 });
  };

  const handleCopyPix = async () => {
    if (!payment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      setCopied(true);
      toast({
        title: "Código PIX copiado! 📋",
        description: "Cole no app do seu banco para pagar.",
        variant: "success",
      });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: "Selecione o código manualmente.",
        variant: "error",
      });
    }
  };

  /* Pré-preenche o nome do usuário logado (username) */
  useEffect(() => {
    if (!user) return;
    if (!getValues("name")) setValue("name", user.username);
  }, [user, setValue, getValues]);

  /* Polling do status do pedido enquanto a etapa de pagamento está aberta */
  useEffect(() => {
    if (!orderId || !token || !orderStatus) return;
    if (orderStatus === "delivered" || orderStatus === "cancelled") return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await api<{ order: SerializedOrder }>(`/orders/${orderId}`, { token });
        if (stopped) return;
        setOrderStatus(res.order.status);
        setDeliveryMode((prev) => prev ?? res.order.deliveryMode);
        if (res.order.status === "cancelled") setExpired(true);
      } catch {
        // falha transitória de rede — segue tentando no próximo tick
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [orderId, token, orderStatus]);

  /* Form submit (Enter nos inputs) replica o botão "Continuar" */
  const onSubmit = async () => {
    if (step !== 0) return;
    await next();
  };

  /* ---------------- estados de página ---------------- */

  if (done) {
    const auto = deliveryMode === "auto";
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="grid size-24 place-items-center rounded-hero bg-gradient-to-br from-success/25 to-success/5 text-6xl shadow-glow"
        >
          🎉
        </motion.div>
        <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">
          Pedido <span className="text-gradient">confirmado</span>!
        </h1>
        <p className="max-w-md text-muted">
          {auto
            ? "Pagamento aprovado e produto entregue automaticamente! Os dados de acesso já estão disponíveis no seu perfil."
            : "Pagamento aprovado! Sua entrega está sendo preparada — ela aparece no seu perfil assim que for concluída."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Button size="xl" onClick={() => navigate("/perfil")}>
            Ver meus pedidos
          </Button>
          <Button size="xl" variant="secondary" onClick={() => navigate("/")}>
            Voltar à loja
          </Button>
        </div>
      </section>
    );
  }

  /* Carrinho vazio (sem pedido em andamento) → estado vazio */
  if (rows.length === 0 && !orderId) {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <motion.span
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-6xl"
        >
          🛍️
        </motion.span>
        <h1 className="text-3xl font-extrabold">Seu carrinho está vazio</h1>
        <p className="max-w-sm text-muted">
          Adicione produtos à vitrine antes de finalizar a compra.
        </p>
        <Button size="xl" onClick={() => navigate("/")}>
          Explorar produtos
        </Button>
      </section>
    );
  }

  /* Sessão persistida ainda sendo validada → não decide o estado de login */
  if (restoring) {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center gap-6 py-24 text-center">
        <span className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
              className="size-2.5 rounded-full bg-primary"
            />
          ))}
        </span>
        <p className="text-sm font-semibold text-muted">Restaurando sua sessão…</p>
      </section>
    );
  }

  /* Pedido precisa de conta para chegar ao admin (aprovação/entrega) */
  if (!token) {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <motion.span
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-6xl"
        >
          🔐
        </motion.span>
        <h1 className="text-3xl font-extrabold">
          Entre para <span className="text-gradient">finalizar</span>
        </h1>
        <p className="max-w-sm text-muted">
          Crie uma conta ou entre para concluir a compra. Assim você acompanha a
          aprovação e o recebimento do seu pedido no perfil.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button size="xl" onClick={() => navigate("/entrar")}>
            Entrar na conta
          </Button>
          <Button size="xl" variant="secondary" onClick={() => navigate("/criar-conta")}>
            Criar conta
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="wrap py-12 sm:py-16">
      <h1 className="mb-10 text-center text-3xl font-extrabold sm:text-4xl">
        Finalizar <span className="text-gradient">compra</span>
      </h1>

      {/* Barra de progresso */}
      <div className="mx-auto mb-12 flex max-w-md items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition-all",
                i === step
                  ? "bg-gradient-to-br from-primary to-secondary text-[#1a0f00] shadow-glow"
                  : i < step
                    ? "cursor-pointer bg-success/20 text-success"
                    : "bg-surface-2 text-dim",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <motion.div
                className="h-1 flex-1 rounded-full bg-surface-2"
                initial={false}
                animate={{ backgroundColor: i < step ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.06)" }}
                transition={{ duration: 0.3 }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_360px]">
        {/* Formulário */}
        <motion.form
          onSubmit={handleSubmit(onSubmit)}
          className="glass rounded-hero p-6 sm:p-8"
          initial={false}
          animate={{ opacity: 1 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="space-y-5"
            >
              {step === 0 && (
                <>
                  <Field label="Nome completo" error={errors.name?.message}>
                    <Input {...register("name")} placeholder="Luna Pimentel" autoFocus />
                  </Field>
                  <Field label="E-mail" error={errors.email?.message}>
                    <Input
                      {...register("email")}
                      placeholder="voce@email.com"
                      type="email"
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="WhatsApp" error={errors.phone?.message}>
                    <Input
                      {...register("phone", {
                        onChange: (e) =>
                          setValue("phone", maskDigits(e.target.value, 11), {
                            shouldValidate: true,
                          }),
                      })}
                      placeholder="(11) 99999-9999"
                      inputMode="numeric"
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="CPF" error={errors.cpf?.message}>
                    <Input
                      {...register("cpf", {
                        onChange: (e) =>
                          setValue("cpf", maskCpf(e.target.value), {
                            shouldValidate: true,
                          }),
                      })}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </Field>
                </>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  {paymentLoading ? (
                    <div className="flex items-center justify-center gap-3 rounded-hero border border-primary/20 bg-primary/5 p-8">
                      <span className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                            className="size-2.5 rounded-full bg-primary"
                          />
                        ))}
                      </span>
                      <p className="text-sm font-semibold text-muted">Gerando seu PIX…</p>
                    </div>
                  ) : paymentError ? (
                    <div className="rounded-hero border border-error/30 bg-error/10 p-6 text-center">
                      <h3 className="font-display text-lg font-extrabold text-text">
                        Não foi possível gerar o PIX
                      </h3>
                      <p className="mt-1 text-sm text-muted">{paymentError}</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={() => void createOrder()}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  ) : payment ? (
                    expired || orderStatus === "cancelled" ? (
                      <div className="rounded-hero border border-error/30 bg-error/10 p-6 text-center">
                        <h3 className="font-display text-lg font-extrabold text-text">
                          PIX expirado
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                          O código de pagamento expirou. Gere um novo para continuar.
                        </p>
                        <Button
                          type="button"
                          className="mt-4"
                          onClick={() => void createOrder()}
                        >
                          Gerar novo PIX
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Cartão PIX */}
                        <div className="rounded-hero border border-primary/20 bg-gradient-to-br from-primary/15 to-secondary/10 p-5 shadow-glow">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <QrCode className="size-5 text-primary" />
                              <h3 className="font-display text-lg font-extrabold">
                                Pagamento <span className="text-gradient">PIX</span>
                              </h3>
                            </div>
                            <div
                              className={cn(
                                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                                remainingSeconds <= 60
                                  ? "bg-error/20 text-error"
                                  : "bg-white/5 text-muted",
                              )}
                              title="Validade do código PIX"
                            >
                              <span className="relative flex size-2">
                                <motion.span
                                  animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                                  className="absolute inline-flex size-full rounded-full bg-current"
                                />
                                <span className="relative inline-flex size-2 rounded-full bg-current" />
                              </span>
                              {formatCountdown(remainingSeconds)}
                            </div>
                          </div>

                          {payment.qrCodeBase64 ? (
                            <div className="mt-4 flex justify-center rounded-2xl bg-white p-4">
                              <img
                                src={`data:image/jpeg;base64,${payment.qrCodeBase64}`}
                                alt="QR Code PIX"
                                className="size-44 object-contain"
                              />
                            </div>
                          ) : (
                            <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-white/10 bg-background/60 p-6 text-center">
                              <div className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary font-display text-3xl font-extrabold text-[#1a0f00] shadow-glow">
                                PIX
                              </div>
                              <p className="mt-3 text-xs text-dim">
                                Em modo simulação: use o código PIX abaixo para testar o fluxo.
                              </p>
                            </div>
                          )}

                          <p className="mt-3 text-xs text-dim">
                            Escaneie o QR ou copie o código para pagar com seu banco.
                          </p>

                          <div className="mt-3 rounded-2xl bg-background/60 p-3">
                            <code className="block select-all break-all font-mono text-[11px] leading-relaxed text-text">
                              {payment.qrCode}
                            </code>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={handleCopyPix}
                            className="mt-3 w-full"
                          >
                            {copied ? (
                              <>
                                <Check className="size-4" />
                                Código copiado!
                              </>
                            ) : (
                              <>
                                <Copy className="size-4" />
                                Copiar código PIX
                              </>
                            )}
                          </Button>

                          {payment.ticketUrl && (
                            <a
                              href={payment.ticketUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 block text-center text-xs font-semibold text-primary underline-offset-4 hover:text-text hover:underline"
                            >
                              Abrir no site do banco →
                            </a>
                          )}
                        </div>

                        {/* Status do pedido */}
                        {orderStatus === "approved" ? (
                          <div className="rounded-2xl bg-success/10 p-4">
                            <h4 className="flex items-center gap-2 font-display text-sm font-extrabold text-text">
                              <Check className="size-4 text-success" />
                              Pagamento confirmado!
                            </h4>
                            <p className="mt-2 text-xs leading-relaxed text-muted">
                              Seu PIX foi aprovado. Agora é só aguardar a entrega — acompanhe
                              tudo em{" "}
                              <button
                                type="button"
                                onClick={() => navigate("/perfil")}
                                className="font-semibold text-primary underline-offset-4 transition-colors hover:text-text hover:underline"
                              >
                                Meu perfil
                              </button>
                              .
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-white/[0.04] p-4">
                            <h4 className="flex items-center gap-2 font-display text-sm font-extrabold text-text">
                              <span className="relative flex size-2">
                                <motion.span
                                  animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                                  className="absolute inline-flex size-full rounded-full bg-secondary"
                                />
                                <span className="relative inline-flex size-2 rounded-full bg-secondary" />
                              </span>
                              Aguardando confirmação do pagamento
                            </h4>
                            <p className="mt-2 text-xs leading-relaxed text-muted">
                              Assim que o PIX for aprovado, seu pedido é confirmado
                              automaticamente.
                            </p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-dim">
                              <Banknote className="size-3.5 text-success" />
                              O pedido só é confirmado depois do pagamento.
                            </p>
                          </div>
                        )}
                      </>
                    )
                  ) : null}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navegação */}
          <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/10 pt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={back}
              className={cn(step === 0 && "invisible")}
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Button>
            {step < 1 ? (
              <Button type="button" size="xl" onClick={next} disabled={paymentLoading}>
                Continuar
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => navigate("/perfil")}>
                Concluir depois — ver no perfil
              </Button>
            )}
          </div>
        </motion.form>

        {/* Resumo */}
        <aside className="glass-strong space-y-4 rounded-hero p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <ShoppingBag className="size-5 text-primary" />
            Resumo do pedido
          </h2>
          <ul className="space-y-3">
            {summaryLines.map((line) => (
              <li key={line.productId} className="flex items-center gap-3">
                <img
                  src={line.image}
                  alt={line.name}
                  className="size-12 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold text-text">{line.name}</p>
                  <p className="text-xs text-dim">Qtd: {line.qty}</p>
                </div>
                <span className="text-sm font-bold text-text">
                  {formatBRL(line.price * line.qty)}
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between text-dim">
              <span>Subtotal</span>
              <span className="font-semibold text-text">{formatBRL(summaryTotal)}</span>
            </div>
            <div className="flex justify-between pt-2 text-base font-display font-extrabold text-text">
              <span>Total</span>
              <span className="text-gradient">{formatBRL(summaryTotal)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* Field com label + mensagem de erro */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-xs font-medium text-error"
        >
          {error}
        </motion.p>
      )}
    </label>
  );
}
