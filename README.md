# 🛍️ A Melhor Loja BR

Loja digital completa com **entrega automática de contas e produtos digitais**, painel administrativo robusto, pagamentos via **Mercado Pago** e banco de dados em **Supabase (PostgreSQL)**.

![Stack](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Stack](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Stack](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Stack](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![Stack](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)

---

## ✨ Funcionalidades

### Para o cliente
- 🏠 **Home cinematográfica** — hero 3D (Three.js / React Three Fiber), efeitos de fundo animados, marquee, depoimentos e animações GSAP/Framer Motion
- 🔍 **Busca instantânea** com overlay animado
- 🛒 **Carrinho** persistente (Zustand + localStorage) com drawer lateral
- ❤️ **Lista de desejos** (wishlist)
- 👤 **Conta** — cadastro, login, troca de senha e perfil
- 📦 **Checkout completo** — endereço, cupom de desconto, CPF validado, PIX/QrCode com status em tempo real
- 🚀 **Entrega digital** — credenciais enviadas automaticamente após aprovação do pagamento

### Para o dono (painel admin)
- 📊 **Dashboard** — vendas de hoje/mês/total, ticket médio, conversão, gráficos de receita, top produtos e clientes
- 📦 **Produtos** — CRUD completo com upload de imagens, estoque, contas de estoque (import/export TXT), FAQ, garantia, termos, badges e modos de entrega (`auto`, `adm`, `manual`)
- 🧾 **Pedidos** — busca, filtros por status, reprocessamento, reembolso, alteração de entrega e auditoria de eventos
- 👥 **Clientes** — banir/desbanir, reset de senha, histórico de pedidos
- 🎟️ **Cupons** — fixo ou percentual, limite de usos, validade e restrição por produto
- 🛡️ **Auditoria** — log de todas as ações administrativas
- 🚨 **Alertas** — estoque baixo, sem estoque, contas insuficientes, produtos inativos

---

## 🧰 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| Animações | Framer Motion, GSAP, Lenis, Three.js / React Three Fiber |
| Estado | Zustand (persistido em localStorage) |
| Backend | Express 5 (TypeScript, execução nativa via `node --experimental-strip-types`) |
| Banco | Supabase (PostgreSQL) — substituiu o SQLite local |
| Pagamentos | Mercado Pago (PIX com QR Code, com fallback de simulação em dev) |
| Uploads | Multer (imagens de produto) |
| Deploy | Vercel (`vercel.json` com rewrites de SPA + `/api`) |

---

## 🚀 Como rodar

### 1. Pré-requisitos
- Node.js 22+ (com suporte a `--experimental-strip-types`)
- Conta no [Supabase](https://supabase.com) com as tabelas criadas (veja `supabase-migration.sql`)
- Conta no [Mercado Pago](https://mercadopago.com.br) (opcional em dev)

### 2. Configuração

```bash
# 1. Instale as dependências
npm install

# 2. Copie o exemplo de env e preencha com suas chaves
cp .env.example .env
```

```env
# .env — variáveis obrigatórias
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

### 3. Banco de dados

Execute o script `supabase-migration.sql` no SQL Editor do Supabase para criar todas as tabelas, RPCs e funções (produtos, categorias, usuários, pedidos, contas, cupons, auditoria, etc.).

### 4. Rodando em desenvolvimento

```bash
npm run dev
```

Isso sobe o **servidor** (`server/index.ts` na porta 3001) e o **frontend Vite** simultaneamente (via `concurrently`). O Vite faz proxy de `/api` → `:3001`.

### 5. Build de produção

```bash
npm run build     # gera o dist/ para o frontend
npm run preview   # pré-visualiza o build
```

---

## ☁️ Deploy na Vercel

O `vercel.json` já configura:

- Build: `npm run build` (frontend estático em `dist/`)
- Rewrites: `/api/*` para o servidor Express e SPA fallback para o `index.html`
- Cache imutável de 1 ano para os assets

> ⚠️ **Importante:** as variáveis de ambiente (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) precisam ser configuradas também no painel da Vercel.

---

## 📁 Estrutura

```
├── server/              # Backend Express
│   ├── index.ts         # Rotas, auth, uploads, pedidos
│   ├── db.ts            # Camada de dados (Supabase)
│   ├── mp.ts            # Integração Mercado Pago (PIX/QR)
│   └── supabase-client.ts
├── src/
│   ├── components/      # UI (hero 3D, produto, carrinho, layout, busca…)
│   ├── lib/
│   │   ├── api.ts       # Cliente HTTP tipado
│   │   ├── db/          # Catálogo, schema e seed local
│   │   ├── store/       # Stores Zustand (auth, cart, catalog, wishlist…)
│   │   └── hooks/       # useTilt, useReveal, useCountUp, useTypewriter…
│   └── pages/
│       ├── admin/       # Dashboard, Produtos, Pedidos, Clientes, Cupons
│       └── …            # Home, Loja, Produto, Checkout, Perfil, Wishlist
└── supabase-migration.sql
```

---

## 🔒 Segurança

- Senhas com hash **scrypt** + comparação em tempo constante
- Sessões com token e validação de banimento a cada requisição
- Rate limiting e mensagens de erro amigáveis (sem vazar detalhes internos)
- `.env` com chaves secretas **nunca** vai para o repositório (apenas `.env.example`)

---

## 📄 Licença

Uso privado — este repositório é o código-fonte da loja **A Melhor Loja BR**.
