import { createClient } from "@supabase/supabase-js";

/* ============================================================
   Supabase Client — substitui o SQLite local (node:sqlite).
   Configuração via env vars:
     SUPABASE_URL            — https://xxxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY — service_role (acesso total)
   ============================================================ */

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  const msg =
    "[supabase] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios " +
    "(configure no painel da Vercel: Settings → Environment Variables).";
  console.error(msg);
  if (process.env.VERCEL) throw new Error(msg); // falha visível nos logs do deploy
  process.exit(1); // local: aborta o boot com a mesma mensagem
}

/** Cliente com service_role — acesso total ao banco (usado pelo servidor). */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
