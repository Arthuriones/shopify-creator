# Shopify Creator — Arquitetura

## O que é
Ferramenta de automação para lojas Shopify focada em dropshipping. Importa produtos do AliExpress, otimiza descrições/títulos com Gemini AI, gera políticas da loja e sugere melhorias de tema.

## Stack

| Tecnologia | Razão |
|---|---|
| **Next.js 15 (App Router)** | SSR + API Routes no mesmo projeto, stack principal do time |
| **TypeScript (strict)** | Type safety desde o dia 1 |
| **Tailwind CSS + shadcn/ui** | UI consistente e rápida de montar |
| **Supabase** | Auth (magic link), Postgres com RLS, zero config de banco |
| **Gemini 2.0 Flash** | Custo baixo (~$0.001/otimização), qualidade suficiente pra copywriting |
| **Cheerio** | Scraping leve do AliExpress, sem overhead de browser |
| **Docker (multi-stage)** | Deploy consistente em VPS |

## Estrutura de Pastas

```
src/
├── app/
│   ├── (auth)/           # Login e callback de auth
│   │   ├── login/        # Magic link login
│   │   └── callback/     # Auth callback
│   ├── (dashboard)/      # Dashboard com sidebar
│   │   ├── stores/       # Gestão de lojas conectadas
│   │   ├── products/     # Import + otimização de produtos
│   │   └── optimizer/    # Políticas + tema
│   └── api/
│       ├── aliexpress/   # Scraping de produtos
│       ├── ai/           # Gemini AI endpoints
│       │   ├── optimize/ # Otimização de produtos
│       │   ├── policies/ # Geração de políticas
│       │   └── theme/    # Análise de tema
│       ├── shopify/      # Integração Shopify
│       │   ├── connect/  # Conexão de lojas
│       │   └── products/ # CRUD de produtos
│       └── health/       # Health check
├── components/
│   ├── layout/           # Sidebar, header
│   └── ui/               # shadcn/ui components
├── lib/
│   ├── aliexpress/       # Scraper
│   ├── gemini/           # Gemini AI client
│   ├── shopify/          # Shopify GraphQL client
│   └── supabase/         # Supabase clients (browser/server)
└── types/                # TypeScript types
```

## Como rodar

```bash
# 1. Clone e instale
npm install

# 2. Configure env
cp .env.example .env
# Preencha: Supabase URL/Key, Gemini API Key

# 3. Rode a migration no Supabase Dashboard (SQL Editor)
# Use o arquivo: supabase/migrations/001_initial.sql

# 4. Rode o dev
npm run dev
```

## Ports

| Serviço | Porta |
|---|---|
| Next.js (dev) | 3000 |

## Decisões de Segurança

- **Auth**: Supabase Magic Link (sem senhas)
- **RLS**: Row Level Security no Postgres — usuários só veem suas lojas/produtos
- **Access Tokens**: Shopify tokens armazenados no Supabase com RLS, nunca expostos ao client
- **CORS**: Controlado pelo Next.js (same-origin por padrão)
- **Docker**: Multi-stage build, non-root user, .dockerignore configurado
- **Secrets**: Todos via .env, nunca hardcoded

## Custos

| Operação | Custo estimado |
|---|---|
| Otimizar 1 produto (Gemini Flash) | ~$0.001 |
| Gerar 4 políticas | ~$0.003 |
| Análise de tema | ~$0.002 |
| Loja completa (50 produtos + políticas + tema) | ~$0.15 |
| Supabase (free tier) | $0/mês |
