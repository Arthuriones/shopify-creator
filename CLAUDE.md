@AGENTS.md

# xcart (package: shopify-creator)

> **Full technical reference: [`ARCHITECTURE.md`](./ARCHITECTURE.md)** — read it for the complete picture. This file is the quick orientation.

## The core idea (most important thing to understand)

xcart is a dropshipping tool built around a **two-store "routed checkout"** model:

- **Vitrine (showcase / source store)** — gets the ad traffic. Carries **branded/replica** products (real brand names, replica models, logos). Customer browses and adds to cart here.
- **Loja checkout (dark store / target store)** — where payment actually happens. Same catalog but **neutralized**: brand/replica names removed from title/description/tags (generic wording) and product photos **replaced by AI-generated de-branded images**.

At checkout, the cart is **routed vitrine → checkout store, matched by SKU**, and the customer is redirected (Shopify cart permalink) to the checkout store's checkout in the right currency. The two stores never appear linked (`no-referrer`).

**Everything hinges on SKU.** Neutralization rewrites titles/images, so SKU is the only stable join key between the two stores. No SKUs on the vitrine → routing can't work. When editing the checkout store, you may freely change title/description/tags/images but **never change or delete variants/SKUs** — that breaks the route.

Also does: multi-source import/clone (AliExpress, Shopify, WooCommerce, Shoplazza, generic sites), AI optimize/translate/neutralize, AI store setup (policies/menus/pages/reviews/Instagram), Stripe billing + credits.

## Stack (current)
- **Next.js 16** (App Router, standalone) + TypeScript + Tailwind v4 + shadcn/ui. React 19. `next-intl` (pt default / en / ja).
- **Supabase** — Auth (password + magic link), Postgres (RLS), Storage. Service-role admin client bypasses RLS.
- **Gemini** — `gemini-2.5-flash` (text), `gemini-2.5-flash-image` (images). Needs `GEMINI_API_KEY`.
- **Shopify** — Admin GraphQL `2024-10`, **Client Credentials Grant** (creds per-store in Supabase `stores`). `write_themes` NOT available this way.
- **Stripe** — subscriptions + credit packs. **Background jobs = Supabase-table queue + Vercel cron** (NOT Inngest/BullMQ).
- **Scraping** — cheerio + Playwright/`@sparticuz/chromium` + Bright Data proxy. `sharp` for images.
- Deploy: **Vercel** (primary, hourly cron) + Docker.

## Multi-host
`adm.*` = admin, `user.*` = app/dashboard, other host = marketing landing only. Logic in `src/proxy.ts` → `src/lib/supabase/middleware.ts`.

## Where things live
- Routing: `src/app/api/checkout-routes/*`, `public/routed-checkout-loader.js`, `src/lib/shopify/cart-routing.ts`, `src/components/routed-checkout/*`
- Shopify + AI: `src/lib/shopify/client.ts`, `src/lib/gemini/client.ts`, `src/lib/ai/product-neutralizer.ts`, `src/lib/store-context.ts`
- Import/jobs: `src/lib/import/*`, `src/lib/aliexpress/*`, `src/lib/jobs/*`, `src/app/api/jobs/*`
- Data: `supabase/migrations/001-018_*.sql` (see ARCHITECTURE.md §5 for every table)

## StoreContext drives all AI
Every AI call receives `StoreContext` (name, niche, target_audience, brand_voice, store_description, **target_language**) from `getStoreContext(storeId, userId)`. API routes fetch it server-side by `storeId`; if `niche` is empty the AI route 400s. `target_language` forces the output language.

## Key gotchas (see ARCHITECTURE.md §13)
- Routing needs SKUs on both stores; generic-site imports often have none.
- `create-destination` neutralizes before dedup and runs one-shot → times out on big catalogs. Use the wizard **"Só conectar"** mode when the catalog already exists.
- Bulk-import queue has no atomic claim / stale recovery (image queue does).
- `write_themes` needs Shopify CLI + Theme Access password, not this app.
- Some prompts/strings still hardcode BR (CDC/LGPD, "R$89") — verify against `target_language`.
