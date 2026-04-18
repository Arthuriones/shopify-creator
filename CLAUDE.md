@AGENTS.md

# Shopify Creator

## O que e
Ferramenta de automacao para lojas Shopify de dropshipping brasileiras. Importa produtos do AliExpress, otimiza com IA (Gemini) para publico BR e publica direto na Shopify. Foco: simplicidade e velocidade.

## Stack
- **Frontend/Backend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Auth & DB:** Supabase (Magic Link, RLS, PostgreSQL)
- **IA:** Google Gemini 2.5 Flash (`@google/generative-ai`)
- **Shopify:** GraphQL API v2024-10 (Client Credentials Grant, token temporario 24h)
- **Scraping:** Cheerio (AliExpress)
- **Background jobs:** Inngest (disponivel, nao implementado ainda)

## Funcionalidades
1. **Conectar loja + perfil** — salva domain + client_id + client_secret + perfil completo (nicho, publico-alvo, voz da marca, descricao, logo). Logo armazenada no Supabase Storage (bucket `store-logos`). Perfil alimenta TODA a IA automaticamente.
2. **Importar produto** — scrape do AliExpress (titulo, descricao, preco, imagens, specs, rating, pedidos, **variantes** com opcoes e precos por SKU)
3. **Otimizar com IA** — Gemini gera titulo, descricao, tags, SEO tudo em PT-BR usando o contexto completo da loja (StoreContext: nome, nicho, publico-alvo, voz da marca, descricao)
4. **Editar antes de publicar** — usuario pode ajustar titulo, descricao, tags, SEO antes de publicar
5. **Publicar na Shopify** — cria produto via GraphQL (variantes multiplas, imagens, SEO) e salva no DB com status
6. **Imagens branded** — aplica logo da loja (do Supabase Storage) sobre imagens do produto usando Sharp. Botao "Aplicar Logo em Todas" na tab Imagens.
7. **Gerar imagem limpa** — IA gera prompt para recriar imagens sem logos/watermarks do AliExpress (DALL-E, Midjourney, Leonardo AI). Prompt inclui contexto da marca.
8. **Gerar e publicar policies** — refund, privacy, terms, shipping via IA, publica direto na Shopify via GraphQL
9. **Analise de tema** — sugestoes de melhoria baseadas no tema real da loja (Vessel theme)
10. **Setup completo da loja** — gera e publica com um clique: 4 policies (CDC/LGPD), menu principal (main-menu), menu footer, paginas (Sobre, Contato, Rastreamento, FAQ), copyright

## Arquitetura de contexto IA
- Todas as funcoes de IA recebem `StoreContext` (src/lib/store-context.ts busca do DB por storeId)
- API routes recebem `storeId`, buscam perfil server-side — cliente nunca envia dados de contexto manualmente
- Se perfil incompleto (sem nicho), API retorna erro claro com instrucao para configurar
- Paginas de Produtos, Store Setup e Optimizer nao tem inputs manuais de nicho/nome — tudo vem do perfil

## Shopify — Custom App (uso proprio)
- App privado criado via dev.shopify.com (Dev Dashboard)
- Sem publicacao na Shopify App Store, sem review
- Autenticacao via Client Credentials Grant (POST /admin/oauth/access_token)
- Token temporario (`shpca_`) expira em 24h — renovado automaticamente pelo client.ts com 5min de margem
- Credenciais (client_id + client_secret) salvas no Supabase por loja
- Permissoes amplas liberadas (sem restricao de aprovacao)

## Tema da loja (Vessel)
- Botao CTA verde (#16c789) "Comprar Agora" direto pro checkout
- Countdown timer de ofertas
- Barra de escassez ("Restam X unidades")
- Calculadora de frete por CEP
- Badges de pagamento (Visa, Master, PIX, Boleto)
- Parcelamento 12x
- Frete gratis acima de R$200
- Instagram feed integrado
- Fonte Montserrat
- Produto recomendados em carousel
- Tema salvo em tema/ na raiz do projeto

## Estrutura principal
```
src/
  app/
    (auth)/login       — login via Magic Link
    (dashboard)/
      stores/          — conectar/gerenciar lojas Shopify (persistidas no Supabase)
      products/        — importar, otimizar, editar, publicar produtos + gerar imagem limpa
      optimizer/       — gerar e publicar policies + analise de tema
      store-setup/     — setup completo da loja (policies + menus + paginas + footer)
    api/
      shopify/connect  — POST: conectar loja
      shopify/products — POST: criar produto
      shopify/policies — POST: publicar policies na Shopify
      shopify/setup    — POST: publicar setup completo (policies + menus + paginas)
      ai/optimize      — POST: otimizar produto com Gemini (PT-BR)
      ai/policies      — POST: gerar policies com Gemini
      ai/theme         — POST: analisar tema
      ai/store-setup   — POST: gerar setup completo da loja com Gemini
      ai/image-prompt  — POST: gerar prompt para recriar imagem sem watermarks
      aliexpress/      — POST: scrape de produto
      health/          — GET: health check
  components/
    layout/sidebar.tsx — navegacao lateral
    ui/                — shadcn/ui components (button, card, dialog, select, tabs, etc)
  lib/
    shopify/client.ts  — GraphQL client com auto-renovacao de token + menus + pages
    gemini/client.ts   — integracao Gemini com prompts otimizados pra BR + store setup + image prompts
    aliexpress/scraper.ts — scraper robusto com fallbacks multiplos
    supabase/          — clients (browser, server, middleware)
  types/index.ts       — Store, Product, AliExpressProduct, OptimizationResult, StorePolicy, StoreSetup
  middleware.ts        — protecao de rotas autenticadas
supabase/
  migrations/001_initial.sql — tabelas stores e products com RLS
  migrations/002_client_credentials.sql — migra access_token para client_id + client_secret
tema/                  — tema Shopify Vessel completo (liquid, JSON, assets)
```

## Banco de dados (Supabase)
- **stores** — id, user_id, shop_domain, client_id, client_secret, name, theme_id, niche, target_audience, brand_voice, store_description, logo_path
- **products** — id, store_id, aliexpress_url, shopify_product_id, title, original_title, description, original_description, price, images[], status (pending|optimized|published|failed)
- **Supabase Storage** — bucket `store-logos` com RLS (users/{user_id}/{store_id}/logo.ext)
- RLS ativado em ambas tabelas + storage
- Constraint unique: (user_id, shop_domain)
- Produtos salvos com status apos publicacao

## Fluxo principal
```
Login (Magic Link)
  → Conectar Loja (salva permanente)
    → Colar link AliExpress
      → Scrape automatico (fotos, titulo, preco, specs)
        → Otimizar com IA (tudo em PT-BR)
          → Editar se necessario
            → Publicar na Shopify
              → Salvo no banco com status
```

## Seguranca
- Auth: Supabase Magic Link (passwordless)
- Credenciais Shopify (client_id/secret): armazenadas com RLS no Supabase
- Tokens de acesso: temporarios (24h), cacheados em memoria, nunca persistidos
- Todas as API routes exigem autenticacao
- Policies publicadas via GraphQL variables (nao string interpolation)
