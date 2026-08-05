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
  console.error("[supabase] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env");
  process.exit(1);
}

/** Cliente com service_role — acesso total ao banco (usado pelo servidor). */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
