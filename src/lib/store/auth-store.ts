import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, ApiError, type User } from "@/lib/api";

/* ============================================================
   AUTH STORE — sessão do usuário (Zustand + persist).
   Token e usuário sobrevivem a reloads (localStorage `ss.db.auth`).
   ============================================================ */

interface AuthState {
  user: User | null;
  token: string | null;
  /** true enquanto valida a sessão persistida ou faz login/registro */
  loading: boolean;
  /** true enquanto revalida a sessão persistida no primeiro render (restore) */
  restoring: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (username: string, avatar: string) => Promise<void>;
  changePassword: (senhaAtual: string, novaSenha: string) => Promise<void>;
  /** Valida o token persistido contra /api/auth/me */
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      restoring: false,

      login: async (username, password) => {
        set({ loading: true });
        try {
          const data = await api<{ token: string; user: User }>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password }),
          });
          set({ token: data.token, user: data.user, loading: false });
        } catch (e) {
          set({ loading: false });
          throw e;
        }
      },

      register: async (username, password) => {
        set({ loading: true });
        try {
          const data = await api<{ token: string; user: User }>("/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, password }),
          });
          set({ token: data.token, user: data.user, loading: false });
        } catch (e) {
          set({ loading: false });
          throw e;
        }
      },

      logout: async () => {
        const token = get().token;
        set({ user: null, token: null });
        if (token) {
          try {
            await api("/auth/logout", { method: "POST", token });
          } catch {
            // sessão local já foi limpa; falha de rede não bloqueia logout
          }
        }
      },

      updateProfile: async (username, avatar) => {
        const token = get().token;
        if (!token) throw new Error("Não autenticado.");
        const data = await api<{ user: User }>("/users/me", {
          method: "PATCH",
          token,
          body: JSON.stringify({ username, avatar }),
        });
        set({ user: data.user });
      },

      changePassword: async (senhaAtual, novaSenha) => {
        const token = get().token;
        if (!token) throw new Error("Não autenticado.");
        // O servidor mantém a sessão atual (revoga as outras) — nada mais
        // a fazer aqui em caso de sucesso; erro propaga para o chamador.
        await api("/users/me", {
          method: "PATCH",
          token,
          body: JSON.stringify({ senhaAtual, novaSenha }),
        });
      },

      restore: async () => {
        const token = get().token;
        if (!token) return;
        set({ restoring: true });
        try {
          const data = await api<{ user: User }>("/auth/me", { token });
          // só aplica o resultado se a sessão ainda for a mesma validada —
          // um login/registro feito enquanto o request voava não pode ser
          // sobrescrito por este restore (evita "deslogou na mesma hora")
          if (get().token === token) set({ user: data.user });
        } catch (e) {
          // só limpa a sessão em falha de AUTENTICAÇÃO (token inválido/expirado).
          // falha de rede (celular sem WiFi, servidor momentaneamente fora)
          // NÃO pode derrubar uma sessão válida.
          if (get().token !== token) return;
          const status = e instanceof ApiError ? e.status : 0;
          if (status === 401 || status === 403) set({ user: null, token: null });
        } finally {
          set({ restoring: false });
        }
      },
    }),
    {
      name: "ss.db.auth",
      // Sessões salvas antes do login por username (era do e-mail) tinham
      // shape diferente (user sem `username`). O migrate descarta esses
      // dados fantasma (que causavam bounce no AuthPage) preservando
      // sessões válidas do formato atual.
      version: 2,
      migrate: (persistedState) => {
        const p = persistedState as { user?: { username?: unknown } };
        if (typeof p.user?.username !== "string") {
          return { user: null, token: null };
        }
        return p as { user: User | null; token: string | null };
      },
      partialize: (s) => ({ user: s.user, token: s.token }),
    },
  ),
);

/** Selector memoizado: usuário logado */
export function useUser(): User | null {
  return useAuthStore((s) => s.user);
}

/** Selector memoizado: token da sessão */
export function useToken(): string | null {
  return useAuthStore((s) => s.token);
}
