-- ============================================================
-- SATOSHII STORE — Schema completo para Supabase (PostgreSQL)
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ============================================================

-- ============================================================
-- 1. TABELAS
-- ============================================================

-- 1.1 users
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '🦊',
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

-- 1.2 sessions
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

-- 1.3 categories
CREATE TABLE IF NOT EXISTS categories (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  icon_key TEXT NOT NULL DEFAULT 'Puzzle',
  emoji    TEXT NOT NULL,
  color    TEXT NOT NULL,
  gradient TEXT NOT NULL,
  blurb    TEXT NOT NULL
);

-- 1.4 products
CREATE TABLE IF NOT EXISTS products (
  slug           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  tagline        TEXT NOT NULL,
  description    TEXT NOT NULL,
  price          REAL NOT NULL,
  old_price      REAL,
  category_id    TEXT NOT NULL REFERENCES categories(id),
  emoji          TEXT NOT NULL,
  hue_a          TEXT NOT NULL,
  hue_b          TEXT NOT NULL,
  badges         JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating         REAL NOT NULL DEFAULT 4.5,
  reviews        INTEGER NOT NULL DEFAULT 0,
  stock          INTEGER NOT NULL DEFAULT 0,
  featured       INTEGER NOT NULL DEFAULT 0,
  delivery_mode  TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_mode IN ('auto', 'adm', 'manual')),
  sku            TEXT,
  tags           JSONB NOT NULL DEFAULT '[]'::jsonb,
  banner         TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  max_qty        INTEGER,
  unlimited_stock INTEGER NOT NULL DEFAULT 0,
  hide_when_zero INTEGER NOT NULL DEFAULT 0,
  extras         JSONB NOT NULL DEFAULT '[]'::jsonb,
  faq            JSONB NOT NULL DEFAULT '[]'::jsonb,
  garantia       TEXT,
  termos         TEXT,
  image_urls     JSONB
);

-- 1.5 orders
CREATE TABLE IF NOT EXISTS orders (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_name        TEXT NOT NULL,
  customer_email       TEXT NOT NULL,
  customer_phone       TEXT NOT NULL,
  shipping_cep         TEXT NOT NULL,
  shipping_street      TEXT NOT NULL,
  shipping_number      TEXT NOT NULL,
  shipping_complement  TEXT,
  shipping_city        TEXT NOT NULL,
  shipping_state       TEXT NOT NULL,
  card_last4           TEXT NOT NULL,
  items_json           JSONB NOT NULL,
  subtotal             REAL NOT NULL,
  shipping_fee         REAL NOT NULL,
  total                REAL NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'delivered', 'cancelled')),
  delivery_json        JSONB,
  processed_at         TEXT,
  created_at           TEXT NOT NULL,
  payment_id           TEXT,
  payment_provider     TEXT NOT NULL DEFAULT 'none',
  payment_status       TEXT CHECK (payment_status IN ('pending', 'approved', 'refunded', 'charged_back', 'expired')),
  delivery_mode        TEXT CHECK (delivery_mode IN ('auto', 'adm', 'manual')),
  needs_manual         INTEGER NOT NULL DEFAULT 0,
  payment_expires_at   BIGINT,
  stock_decrement_json JSONB,
  coupon_code          TEXT,
  discount_amount      REAL DEFAULT 0
);

-- 1.6 subscribers
CREATE TABLE IF NOT EXISTS subscribers (
  email         TEXT PRIMARY KEY,
  subscribed_at TEXT NOT NULL
);

-- 1.7 processed_payments (idempotência do webhook)
CREATE TABLE IF NOT EXISTS processed_payments (
  payment_id TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id),
  status     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 1.8 accounts (estoque de contas — auto-delivery)
CREATE TABLE IF NOT EXISTS accounts (
  id             TEXT PRIMARY KEY,
  product_slug   TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  password       TEXT NOT NULL,
  email_password TEXT,
  codigo_extra   TEXT,
  observacoes    TEXT,
  used           INTEGER NOT NULL DEFAULT 0,
  order_id       TEXT REFERENCES orders(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL
);

-- 1.9 activity_logs (auditoria admin)
CREATE TABLE IF NOT EXISTS activity_logs (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     JSONB,
  ip          TEXT,
  created_at  TEXT NOT NULL
);

-- 1.10 settings (chave-valor)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 1.11 order_events (timeline de pedidos)
CREATE TABLE IF NOT EXISTS order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id   TEXT,
  details    JSONB,
  created_at TEXT NOT NULL
);

-- 1.12 coupons
CREATE TABLE IF NOT EXISTS coupons (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
  value         REAL NOT NULL,
  min_value     REAL DEFAULT 0,
  max_uses      INTEGER,
  uses_count    INTEGER DEFAULT 0,
  active        INTEGER DEFAULT 1,
  expires_at    TEXT,
  product_slugs JSONB,
  created_at    TEXT NOT NULL
);

-- 1.13 product_movements (ledger de estoque/contas)
CREATE TABLE IF NOT EXISTS product_movements (
  id           TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('stock', 'account')),
  action       TEXT NOT NULL,
  qty          INTEGER,
  note         TEXT,
  created_at   TEXT NOT NULL
);

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_accounts_available ON accounts(product_slug) WHERE used = 0;
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_product_movements_product ON product_movements(product_slug, created_at);

-- ============================================================
-- 3. RLS (Row Level Security) — desabilitado por padrão para service_role
--    Ative conforme necessário quando usar o anon key no frontend
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_movements ENABLE ROW LEVEL SECURITY;

-- Políticas para service_role (acesso total — o servidor usa service_role)
CREATE POLICY "service_all_users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_subscribers" ON subscribers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_processed_payments" ON processed_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_accounts" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_activity_logs" ON activity_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_settings" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_order_events" ON order_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_coupons" ON coupons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_product_movements" ON product_movements FOR ALL USING (true) WITH CHECK (true);

-- Políticas para anon (frontend) — leitura pública de catálogo
CREATE POLICY "anon_read_categories" ON categories FOR SELECT USING (true);
CREATE POLICY "anon_read_products" ON products FOR SELECT USING (true);
CREATE POLICY "anon_insert_subscribers" ON subscribers FOR INSERT WITH CHECK (true);

-- ============================================================
-- 4. FUNCTIONS TRANSACIONAIS (RPCs)
--    Estas functions garantem atomicidade no banco.
--    O servidor as chama via: supabase.rpc('nome_function', { ... })
-- ============================================================

-- 4.1 claim_account — claim atômico de 1 conta disponível para um pedido
CREATE OR REPLACE FUNCTION claim_account(p_product_slug TEXT, p_order_id TEXT)
RETURNS TABLE (
  id             TEXT,
  product_slug   TEXT,
  email          TEXT,
  password       TEXT,
  email_password TEXT,
  codigo_extra   TEXT,
  observacoes    TEXT,
  used           INTEGER,
  order_id       TEXT,
  created_at     TEXT
) AS $$
DECLARE
  v_account_id TEXT;
BEGIN
  -- Seleciona a conta mais antiga disponível (FOR UPDATE + SKIP LOCKED para evitar race condition)
  SELECT a.id INTO v_account_id
  FROM accounts a
  WHERE a.product_slug = p_product_slug
    AND a.used = 0
    AND a.order_id IS NULL
  ORDER BY a.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- Marca como usada
  UPDATE accounts
  SET used = 1, order_id = p_order_id
  WHERE id = v_account_id AND used = 0;

  -- Retorna a conta
  RETURN QUERY
  SELECT a.id, a.product_slug, a.email, a.password, a.email_password,
         a.codigo_extra, a.observacoes, a.used, a.order_id, a.created_at
  FROM accounts a
  WHERE a.id = v_account_id;
END;
$$ LANGUAGE plpgsql;

-- 4.2 increment_coupon_uses — incrementa uses_count respeitando max_uses
CREATE OR REPLACE FUNCTION increment_coupon_uses(p_coupon_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE coupons
  SET uses_count = uses_count + 1
  WHERE id = p_coupon_id
    AND (max_uses IS NULL OR uses_count < max_uses);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql;

-- 4.3 insert_processed_payment — insere com ON CONFLICT (idempotente)
CREATE OR REPLACE FUNCTION insert_processed_payment(
  p_payment_id TEXT,
  p_order_id   TEXT,
  p_status     TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO processed_payments (payment_id, order_id, status, created_at)
  VALUES (p_payment_id, p_order_id, p_status, now()::text)
  ON CONFLICT (payment_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 4.4 is_payment_processed — verifica se já processou
CREATE OR REPLACE FUNCTION is_payment_processed(p_payment_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM processed_payments WHERE payment_id = p_payment_id) INTO v_exists;
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- 4.5 decrement_stock — decrementa estoque de 1 produto
CREATE OR REPLACE FUNCTION decrement_stock(p_slug TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_ok INTEGER;
BEGIN
  UPDATE products SET stock = stock - 1
  WHERE slug = p_slug AND stock > 0;

  GET DIAGNOSTICS v_ok = ROW_COUNT;
  RETURN v_ok > 0;
END;
$$ LANGUAGE plpgsql;

-- 4.6 update_order_status — atualiza status + delivery_json
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id      TEXT,
  p_status        TEXT,
  p_delivery_json JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE orders
  SET status = p_status,
      delivery_json = COALESCE(p_delivery_json, delivery_json),
      processed_at = CASE WHEN p_status IN ('approved', 'delivered') THEN now()::text ELSE processed_at END
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- 4.7 update_payment_status — atualiza payment_status
CREATE OR REPLACE FUNCTION update_payment_status(
  p_order_id       TEXT,
  p_payment_status TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE orders SET payment_status = p_payment_status WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- 4.8 insert_order_event — insere evento na timeline do pedido
CREATE OR REPLACE FUNCTION insert_order_event(
  p_order_id   TEXT,
  p_event      TEXT,
  p_actor_type TEXT,
  p_actor_id   TEXT DEFAULT NULL,
  p_details    JSONB DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_id TEXT;
BEGIN
  v_id = 'evt_' || encode(gen_random_bytes(6), 'hex');
  INSERT INTO order_events (id, order_id, event, actor_type, actor_id, details, created_at)
  VALUES (v_id, p_order_id, p_event, p_actor_type, p_actor_id, p_details, now()::text);
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- 4.9 insert_activity_log — insere log de auditoria do admin
CREATE OR REPLACE FUNCTION insert_activity_log(
  p_id          TEXT,
  p_admin_id    TEXT,
  p_action      TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id   TEXT DEFAULT NULL,
  p_details     JSONB DEFAULT NULL,
  p_ip          TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO activity_logs (id, admin_id, action, entity_type, entity_id, details, ip, created_at)
  VALUES (p_id, p_admin_id, p_action, p_entity_type, p_entity_id, p_details, p_ip, now()::text);
END;
$$ LANGUAGE plpgsql;

-- 4.10 log_movement — registra movimentação de estoque/contas
CREATE OR REPLACE FUNCTION log_movement(
  p_product_slug TEXT,
  p_kind         TEXT,
  p_action       TEXT,
  p_qty          INTEGER DEFAULT NULL,
  p_note         TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_id TEXT;
BEGIN
  v_id = 'mv_' || encode(gen_random_bytes(6), 'hex');
  INSERT INTO product_movements (id, product_slug, kind, action, qty, note, created_at)
  VALUES (v_id, p_product_slug, p_kind, p_action, p_qty, p_note, now()::text);
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- 4.11 set_order_coupon — grava cupom/desconto no pedido
CREATE OR REPLACE FUNCTION set_order_coupon(
  p_order_id TEXT,
  p_code     TEXT,
  p_discount REAL
)
RETURNS VOID AS $$
BEGIN
  UPDATE orders SET coupon_code = p_code, discount_amount = p_discount WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- 4.12 delete_sessions_for_user — remove todas as sessões de um usuário
CREATE OR REPLACE FUNCTION delete_sessions_for_user(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM sessions WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 4.13 delete_sessions_for_user_except — remove sessões exceto a atual
CREATE OR REPLACE FUNCTION delete_sessions_for_user_except(
  p_user_id   TEXT,
  p_keep_token TEXT
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM sessions WHERE user_id = p_user_id AND token <> p_keep_token;
END;
$$ LANGUAGE plpgsql;

-- 4.14 prune_expired_sessions — limpa sessões expiradas
CREATE OR REPLACE FUNCTION prune_expired_sessions(p_now BIGINT DEFAULT 0)
RETURNS VOID AS $$
BEGIN
  IF p_now = 0 THEN
    DELETE FROM sessions WHERE expires_at < EXTRACT(EPOCH FROM now()) * 1000;
  ELSE
    DELETE FROM sessions WHERE expires_at < p_now;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 4.15 restore_stock — restaura estoque de um produto em qty unidades
CREATE OR REPLACE FUNCTION restore_stock(p_slug TEXT, p_qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE products SET stock = stock + p_qty WHERE slug = p_slug;
END;
$$ LANGUAGE plpgsql;

-- 4.16 release_accounts_by_order — libera contas claimadas de um pedido
--      Retorna os product_slug afetados (para o ledger).
CREATE OR REPLACE FUNCTION release_accounts_by_order(p_order_id TEXT)
RETURNS TABLE (product_slug TEXT) AS $$
BEGIN
  RETURN QUERY
  UPDATE accounts
  SET used = 0, order_id = NULL
  WHERE order_id = p_order_id AND used = 1
  RETURNING product_slug;
END;
$$ LANGUAGE plpgsql;

-- 4.17 decrement_coupon_uses — decrementa uses_count de um cupom (refund)
CREATE OR REPLACE FUNCTION decrement_coupon_uses(p_code TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE coupons
  SET uses_count = GREATEST(0, uses_count - 1)
  WHERE code = p_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. MIGRAÇÃO DE DADOS (opcional — execute se quiser migrar do SQLite)
--    Se o banco está vazio, pule esta seção.
-- ============================================================

-- Para migrar dados do SQLite existente, você pode:
-- 1. Exportar do SQLite: .dump > backup.sql
-- 2. Ajustar a sintaxe SQL (SQLite → PostgreSQL)
-- 3. Importar aqui
--
-- Ou usar a ferramenta pgloader:
-- pgloader sqlite:///path/to/satoshii.db postgresql://...

-- ============================================================
-- PRONTO! Agora configure o .env do servidor com as credenciais:
--   SUPABASE_URL=https://zotzjqqqywgurwfjenoa.supabase.co
--   SUPABASE_ANON_KEY=eyJhbGci...
--   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
-- ============================================================
