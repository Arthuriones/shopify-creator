# xcart — Improvement Backlog

Prioritized suggestions from full-codebase audits. Rationale in `ARCHITECTURE.md §13`.
Last updated: 2026-08 (after the signup / clone / onboarding audit).

---

## ✅ Done

- **Exact-SKU dedup in `create-destination`** (`d2b0774`) — Shopify's `sku:` search is tokenized (splits on `-`), so distinct models were merged and colliding variants silently dropped.
- **Admin 404 + redirect loop** (`a9f704c`, `6c2e16f`) — the `adm.` host never ran next-intl, so `/login` 404'd and the panel was impossible to sign into; a non-admin account looped instead of being told.
- **Signup silently failing** (`6e18e9c`) — `signUp()` result ignored `data.session`, so with "Confirm email" ON new users were bounced back to login with zero feedback. Also: `?next=` now honored, `User already registered` mapped, landing CTAs open the signup form, `ja` locale prefix fixed.
- **Onboarding: copy buttons + single-source scopes + auto-open profile** (`51e8bbd`) — the three paste-into-Shopify blocks now have copy buttons; scopes live in `src/lib/shopify/scopes.ts` (tutorial and OAuth had drifted on `write_themes`); the profile editor opens after OAuth install.
- **Clone: search / sort / category filter** (`25f9082`) — preview toolbar with text search, 6 sort modes and multi-select category chips; "select all" now respects the filter.
- **Clone: failure details, live counters, cancel** (`e758cc6`) — `failed[]` from the API is rendered per product instead of a bare count; created/skipped/failed shown; the already-wired AbortController got a UI trigger.

---

## P0 — reliability

1. **Auto-generate SKUs on import.** Generic-site imports produce empty SKUs, which silently breaks routed checkout (everything keys on SKU). Stamp a deterministic SKU at create time in `toCreateProductInput` / `publishImportedProduct` / `create-destination`.

2. **Rework `create-destination` for large catalogs.** It AI-translates *before* checking for existing products and processes the whole catalog in one 300 s request → timeouts leaving partial/duplicate products. Move dedup before the AI step; convert to the background-job queue pattern used by `neutralize_image`.

3. **Kill the preview N+1.** `attachCollectionsToProducts` runs on *every* preview and export: it loops up to 50 collections × up to 20 sequential paginated fetches ≈ 1000 sequential round-trips inside a `maxDuration = 120` route, and `handleApply` re-triggers a full preview before every import. Make it opt-in, skip it when a collection scope is set, and parallelize with a concurrency pool.

4. **Harden the bulk-import queue.** `processBulkImportJobs` has no atomic claim (the `after()` drainer and the hourly cron can double-process → duplicate products) and no stale recovery (a job dying mid-loop stays `processing` forever). Copy the image queue's optimistic claim + stale cutoff.

5. **Persist batched clone runs.** `recordRun: false` is sent on every batch, so bulk imports write no `clone_runs` row — history is empty for exactly the runs that matter.

6. **Verify the Shopify OAuth HMAC.** `api/shopify/auth/route.ts` exchanges the code without validating the `hmac` query param, and `state` is the raw store id rather than a single-use nonce.

7. **Replace prose-regex install detection.** `api/shopify/connect/route.ts` decides "app not installed" by matching the accent-less Portuguese string `nao esta instalado`. Any copy edit silently breaks the OAuth redirect. Needs a typed `APP_NOT_INSTALLED` code.

8. **Guard `/no-access` against a missing profile row.** `profileCanEnter(null)` returns `false`, so a brand-new user whose `profiles` row hasn't committed is told their free trial ended.

## P1 — feature gaps

9. **Carry `productType`, `vendor` and `sku` through the clone.** `toShopifyCreateProductInput` drops all three though `createProduct` accepts them. Product Type is Shopify's native category field and the *only* category signal that survives a WooCommerce import.

10. **Server-side multi-collection scope.** The client can now filter by several categories, but the server still accepts a single `collectionHandle`. For large sources, fetching only the chosen collections would be much faster.

11. **Richer collection recreation.** `createCollection` sends only `{title, handle}` — no `descriptionHtml`, `image`, `sortOrder`, `seo`, `ruleSet` (smart collections become manual ones). Also read `products_count` / `sort_order` from `/collections.json` (already on the wire, discarded in `normalizeCollection`) and paginate past 250 collections.

12. **Collection sort order on the target.** No `sortOrder` is set, so Shopify defaults to `BEST_SELLING` — on a brand-new store with zero sales that is effectively arbitrary. For `MANUAL` source collections, replay positions with `collectionReorderProducts`.

13. **Make AI output honor `target_language`.** `generateStorePolicies` and `suggestThemeImprovements` hardcode Brazilian context (CDC/LGPD, 15–30 business days, R$) regardless of the store's language — wrong legal content for a JP/CL store.

14. **Wire WooCommerce & Shoplazza into the generic import pipeline.** They are clone-only; the multi-site page advertises them but forces `generic_site` (lossy HTML scrape, no SKUs).

15. **Route health should check shipping and payments.** A missing shipping rate on the checkout store blocks every order and the current `health` endpoint (SKU-only) reports everything green. This happened in production.

## P2 — UX / polish

16. **Onboarding checklist on the dashboard** (Connect store → Complete profile → Import first product), driven by counts already fetched.
17. **Empty states** for `/clone`, `/optimizer`, `/products`, `/reviews`, `/instagram` — today a user with no store hits a silently dead form.
18. **Deep-link the "profile incomplete" AI errors** to the profile editor, and signal it before the user fills a form.
19. **Move the clone wizard out of the 672 px modal**, virtualize the product list (`MAX_CLONE_LIMIT = 5000` renders 5000 eager `<img>`), add `loading="lazy"`.
20. **Inline, persistent connect errors** — a mistyped secret vanishes with a 4 s toast while the dialog stays filled. Add a "Testar credenciais" probe.
21. **Name capture + password confirm + terms checkbox at signup**; replace `confirm()` on destructive store actions.
22. **Surface trial status** so `/no-access` is never a surprise.
23. **Remove or implement `CloneMode`** — declared and never read.

## P3 — i18n debt (blocks a non-PT launch)

24. **The Shopify tutorial body is hardcoded Portuguese** behind an i18n'd toggle — EN/JA users read PT instructions for the hardest step.
25. **`set-password` has zero translations** and imports `useRouter` from `next/navigation`, dropping the locale prefix.
26. **~31 hardcoded toasts in `stores/page.tsx`**, mixed with hardcoded *English* labels in the same dialog.
27. **Clone steps 3–4 and every toast** are hardcoded pt-BR though `clone_page` keys exist.
28. **`auth.sendAccessLink` says "Enviar link de acesso"** but the action sends a password reset.

## Security / cost

29. **`public_token` hardening** — `resolve` / `track-fallback` are wide-open CORS with only the token as auth; anyone holding it can enumerate a route's variant ids.
30. **Credit gating is inconsistent** — the deferred image queue debits credits; inline neutralization in bulk/clone does not.
31. **Complete `.env.example`** — missing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `BILLING_ENFORCED`, `ACCESS_CONTROL_ENABLED`, `BULK_IMPORT_CRON_SECRET`.
32. **AliExpress reviews endpoint is a stub** returning hardcoded fake reviews.
