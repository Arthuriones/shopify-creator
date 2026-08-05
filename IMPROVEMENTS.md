# xcart — Improvement Backlog

Prioritized from full-codebase audits. Rationale in `ARCHITECTURE.md §13`.
Last updated: 2026-08.

---

## ✅ Done

- **Exact-SKU dedup in `create-destination`** (`d2b0774`) — Shopify's `sku:` search is tokenized (splits on `-`), so distinct models were merged and colliding variants silently dropped.
- **Admin 404 + redirect loop** (`a9f704c`, `6c2e16f`) — the `adm.` host never ran next-intl, so `/login` 404'd and the panel was impossible to sign into; a non-admin account looped instead of being told.
- **Signup silently failing** (`6e18e9c`) — `signUp()` ignored `data.session`, so with "Confirm email" ON new users bounced back to login with zero feedback. Also `?next=`, `User already registered`, signup-mode CTAs, `ja` prefix.
- **Onboarding: copy buttons, single-source scopes, auto-open profile** (`51e8bbd`) — tutorial and OAuth had drifted on `write_themes`.
- **Clone: search / sort / category filter** (`25f9082`).
- **Clone: failure details, live counters, cancel** (`e758cc6`).
- **Preview N+1 parallelized** (`be56732`) — collection attach went from ~1000 serial requests to a pool of 8, and is skipped when a collection scope is set.
- **SKUs always emitted + `vendor`/`productType` carried through** (`be56732`) — deterministic SKU when the source has none.
- **Bulk-import queue hardened** (`7a5adf6`) — atomic claim + 10-min stale recovery.
- **Typed `APP_NOT_INSTALLED`** (`7a5adf6`) — no longer regex-matches a Portuguese sentence.
- **`/no-access` guard** (`7a5adf6`) — a missing profile row no longer means "trial over".
- **Market-aware AI policies** (`730490a`) — pt/es/ja/en profiles instead of hardcoded CDC/LGPD/PIX.
- **OAuth HMAC verification + dashboard onboarding checklist** (`b5ff73a`).

---

## P0 — reliability

1. **Rework `create-destination` for large catalogs.** It AI-translates *before* checking for existing products and processes the whole catalog in one 300 s request → timeouts leaving partial/duplicate products. Move dedup before the AI step; convert to the background-job queue pattern used by `neutralize_image`. *(The dedup itself is already fixed; the queueing is not.)*

2. **Persist batched clone runs.** `recordRun: false` is sent on every batch, so bulk imports write no `clone_runs` row — history is empty for exactly the runs that matter.

3. **Route health should check shipping and payments.** A missing shipping rate on the checkout store blocks every order while the SKU-only `health` endpoint reports everything green. This happened in production (BLK Store / Chile).

## P1 — feature gaps

4. **Server-side multi-collection scope.** The client filters by several categories, but the server still accepts a single `collectionHandle`. For large sources, fetching only the chosen collections would be much faster.

5. **Richer collection recreation.** `createCollection` sends only `{title, handle}` — no `descriptionHtml`, `image`, `sortOrder`, `seo`, `ruleSet` (smart collections become manual ones). Also read `products_count` / `sort_order` from `/collections.json` (already on the wire, discarded in `normalizeCollection`) and paginate past 250 collections.

6. **Collection sort order on the target.** No `sortOrder` is set, so Shopify defaults to `BEST_SELLING` — arbitrary on a store with zero sales. For `MANUAL` source collections, replay positions with `collectionReorderProducts`.

7. **`suggestThemeImprovements` still hardcodes a Brazilian theme** (green CTA, PIX/boleto badges, R$200 free shipping). Policies are market-aware now; theme guidance is not.

8. **Wire WooCommerce & Shoplazza into the generic import pipeline.** They are clone-only; the multi-site page advertises them but forces `generic_site` (lossy HTML scrape).

9. **Neutralization merges distinct products.** Generic titles + `Color`/`Size` options make two different models collide on the same option combo; Shopify rejects the duplicate and the variant is dropped. Seen in production (Vans/Puma colorways). Needs a per-source-product identity key.

## P2 — UX / polish

10. **Empty states** for `/clone`, `/optimizer`, `/products`, `/reviews`, `/instagram` — a user with no store hits a silently dead form.
11. **Deep-link the "profile incomplete" AI errors** to the profile editor, and signal it before the user fills a form.
12. **Move the clone wizard out of the 672 px modal**, virtualize the product list (`MAX_CLONE_LIMIT = 5000` renders 5000 eager `<img>`), add `loading="lazy"`.
13. **Inline, persistent connect errors** — a mistyped secret vanishes with a 4 s toast. Add a "Testar credenciais" probe.
14. **Name capture + password confirm + terms checkbox at signup**; replace `confirm()` on destructive store actions.
15. **Surface trial status** so `/no-access` is never a surprise.
16. **Remove or implement `CloneMode`** — declared and never read.

## P3 — i18n debt (blocks a non-PT launch)

17. **The Shopify tutorial body is hardcoded Portuguese** behind an i18n'd toggle — EN/JA users read PT instructions for the hardest step.
18. **`set-password` has zero translations** and imports `useRouter` from `next/navigation`, dropping the locale prefix.
19. **~31 hardcoded toasts in `stores/page.tsx`**, mixed with hardcoded *English* labels in the same dialog.
20. **Clone steps 3–4 and every toast** are hardcoded pt-BR though `clone_page` keys exist.
21. **`auth.sendAccessLink` says "Enviar link de acesso"** but the action sends a password reset.
22. **Mojibake in `gemini/client.ts` prompts** — several strings are double-encoded UTF-8 (`polÃ­ticas`). Cosmetic in source, but it is what gets sent to the model.

## Security / cost

23. **`public_token` hardening** — `resolve` / `track-fallback` are wide-open CORS with only the token as auth; anyone holding it can enumerate a route's variant ids.
24. **Credit gating is inconsistent** — the deferred image queue debits credits; inline neutralization in bulk/clone does not.
25. **Complete `.env.example`** — missing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `BILLING_ENFORCED`, `ACCESS_CONTROL_ENABLED`, `BULK_IMPORT_CRON_SECRET`.
26. **AliExpress reviews endpoint is a stub** returning hardcoded fake reviews.
