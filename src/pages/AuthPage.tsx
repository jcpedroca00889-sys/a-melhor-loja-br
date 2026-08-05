import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Sparkles, UserPlus } from "lucide-react";
import { useAuthStore, useUser } from "@/lib/store/auth-store";
import { toast } from "@/lib/store/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getLenis } from "@/lib/lenis";

/* ============================================================
   AUTH PAGE — login e criação de conta (RHF + zod).
   Um único componente com `mode`: "login" | "register",
   usado pelas rotas /entrar e /criar-conta.
   ============================================================ */

const authSchema = z
  .object({
    username: z.string(),
    password: z.string().min(6, "Senha precisa de pelo menos 6 caracteres"),
  })
  .superRefine((data, ctx) => {
    const username = data.username.trim();
    if (username.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Username precisa de pelo menos 3 caracteres",
      });
    } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Use apenas letras, números, _ e -",
      });
    }
  });

type AuthForm = z.infer<typeof authSchema>;

const AVATAR_PRESETS = ["🦊", "🐼", "🐸", "🐙", "🦄", "🐯", "👾", "🤖"];

/** Botão com estado de carregamento elegante (sem spinner) */
function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="xl" className="w-full" disabled={loading}>
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                className="size-1.5 rounded-full bg-current"
              />
            ))}
          </span>
          Processando…
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUser();
  const restoring = useAuthStore((s) => s.restoring);
  const loading = useAuthStore((s) => s.loading);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [showPassword, setShowPassword] = useState(false);
  const [avatar, setAvatar] = useState(AVATAR_PRESETS[0]);

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    mode: "onChange",
    defaultValues: { username: "", password: "" },
  });

  /* Usuário logado acessando a página de auth → redireciona para o perfil.
     Só redireciona com sessão bem-formada (username presente) — uma sessão
     fantasma/antiga do localStorage não pode causar bounce. E enquanto a
     sessão persistida ainda está sendo validada (restore), segura o redirect:
     redirecionar antes da validação joga o usuário pra /perfil com uma sessão
     que pode ser limpa logo em seguida. */
  useEffect(() => {
    if (restoring) return;
    if (user?.username) {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/perfil", { replace: true });
    }
  }, [user, restoring, navigate, location.state]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const username = data.username.trim();
      if (mode === "login") {
        await login(username, data.password);
        toast({
          title: "Bem-vindo de volta! 🎉",
          description: "Login realizado com sucesso.",
          variant: "success",
        });
      } else {
        // register() já grava token + user → auto-login imediato
        await register(username, data.password);
        // aplica o avatar escolhido (servidor cria com 🦊 padrão). Falha aqui
        // não bloqueia o sucesso: a conta já existe e a sessão já está ativa.
        try {
          await updateProfile(username, avatar);
        } catch {
          /* avatar opcional — pode ser trocado depois no perfil */
        }
        toast({
          title: "Conta criada! 🧡",
          description: "Bem-vindo à SATOSHII STORE. Bora comprar?",
          variant: "success",
        });
      }
      getLenis()?.scrollTo(0, { duration: 0.4 });
    } catch (e) {
      toast({
        title: mode === "login" ? "Não foi possível entrar" : "Não foi possível criar a conta",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "error",
      });
    }
  });

  const otherMode = mode === "login" ? "register" : "login";

  /* Sessão persistida ainda sendo validada → loading elegante no lugar do
     formulário. Evita flash do form + redirect errado (sessão fantasma). */
  if (restoring) {
    return (
      <div className="wrap grid min-h-[70vh] place-items-center py-16 sm:py-24">
        <div className="flex flex-col items-center gap-5">
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
        </div>
      </div>
    );
  }

  return (
    <div className="wrap grid min-h-[70vh] items-center py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-4xl items-center gap-10 lg:grid-cols-2">
        {/* Painel de apresentação */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="hidden lg:block"
        >
          <motion.span
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block text-6xl"
          >
            {mode === "login" ? "🦊" : "🎈"}
          </motion.span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight xl:text-5xl">
            {mode === "login" ? (
              <>
                Que bom te ver de <span className="text-gradient">volta</span>!
              </>
            ) : (
              <>
                Bem-vindo à{" "}
                <span className="text-gradient">SATOSHII STORE</span>
              </>
            )}
          </h1>
          <p className="mt-4 max-w-sm text-muted">
            {mode === "login"
              ? "Acesse sua conta para acompanhar pedidos, gerenciar seu perfil e desbloquear ofertas exclusivas."
              : "Crie sua conta grátis e tenha uma experiência de compra encantadora. Sem pegadinhas, só alegria."}
          </p>
          <ul className="mt-8 space-y-3 text-sm text-dim">
            {[
              "Pedidos e histórico na sua conta",
              "Novidades e lançamentos em primeira mão",
              "Checkout mais rápido, sem repetir dados",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Sparkles className="size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Card de formulário */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="glass-strong rounded-hero p-6 shadow-lift sm:p-8"
        >
          <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
            {mode === "login" ? (
              <>
                Entrar na <span className="text-gradient">conta</span>
              </>
            ) : (
              <>
                Criar <span className="text-gradient">conta grátis</span>
              </>
            )}
          </h2>
          <p className="mt-1.5 text-sm text-dim">
            {mode === "login"
              ? "Ainda não tem conta? "
              : "Já tem uma conta? "}
            <Link
              to={otherMode === "login" ? "/entrar" : "/criar-conta"}
              state={location.state}
              className="font-semibold text-primary transition-colors hover:text-secondary"
            >
              {otherMode === "login" ? "Entre por aqui" : "Crie sua conta"}
            </Link>
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            {mode === "register" && (
              <>
                {/* Escolha de avatar */}
                <div>
                  <span className="mb-1.5 block text-sm font-semibold text-muted">Seu avatar</span>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_PRESETS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAvatar(a)}
                        title={`Avatar ${a}`}
                        className={cn(
                          "grid size-11 place-items-center rounded-2xl text-xl transition-all duration-300 hover:scale-110 active:scale-95",
                          avatar === a
                            ? "bg-gradient-to-br from-primary/30 to-secondary/20 shadow-glow ring-2 ring-primary"
                            : "glass text-muted hover:bg-white/10",
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Field label="Username" error={errors.username?.message}>
              <Input
                {...field("username")}
                placeholder="luna_pimentel"
                autoComplete="username"
                autoFocus
              />
            </Field>

            <Field label="Senha" error={errors.password?.message}>
              <div className="relative">
                <Input
                  {...field("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-dim transition-all duration-300 hover:scale-110 hover:text-primary active:scale-95"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <SubmitButton loading={loading}>
              {mode === "login" ? (
                <>
                  <LogIn className="size-4" />
                  Entrar
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  Criar minha conta
                </>
              )}
            </SubmitButton>
          </form>

          <p className="mt-5 text-center text-xs text-dim">
            Ao continuar, você concorda com os{" "}
            <span className="cursor-pointer text-muted underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary">
              Termos de uso
            </span>{" "}
            e a{" "}
            <span className="cursor-pointer text-muted underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary">
              Política de privacidade
            </span>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/* Field com label + mensagem de erro (mesmo padrão do CheckoutPage) */
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
