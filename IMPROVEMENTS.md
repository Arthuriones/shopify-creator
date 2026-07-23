# xcart — Improvement Backlog

Prioritized suggestions from a full-codebase audit (2026-07). Rationale for each is in `ARCHITECTURE.md §13`. Ordered by impact/effort.

## P0 — reliability of the core routing flow (these have already bitten in production)

1. **Auto-generate SKUs on import.** Generic-site imports (and any source without SKUs) produce products with empty SKUs, which silently breaks routed checkout (the whole system keys on SKU). Stamp a deterministic SKU at create time when the source has none — e.g. `<storeSlug>-<sequential>` or a hash of `handle+optionValues`. Do it in `toCreateProductInput`/`publishImportedProduct` and in `create-destination`. *This was the root cause of a real routing failure.*

2. **Rework `create-destination` for large catalogs.** Today it (a) AI-translates/neutralizes *before* checking for existing products, and (b) processes the whole catalog in one 300s request. Big catalogs time out ("Failed to fetch") leaving partial + duplicate products. Fix:
   - Move `findExistingProduct` (SKU match) **before** the AI step — skip existing, don't re-translate.
   - Convert to the **background-job queue** pattern (like `neutralize_image`): enqueue one job per product, drain with concurrency + stale-recovery + self-chaining. Return immediately; poll progress.

3. **Harden the bulk-import queue.** `processBulkImportJobs` has **no atomic claim** (select-then-update → the `after()` drainer and hourly cron can double-process the same rows → duplicate products) and **no stale recovery** (a job that dies mid-loop stays `processing` forever, invisible to the `pending`-only drainer). Adopt the image queue's pattern: optimistic claim (`update ... where status='pending'` returning the row) + reset `processing` older than N minutes back to `pending`.

## P1 — correctness & coverage

4. **Make AI output honor `target_language` fully.** `generateStorePolicies` and `suggestThemeImprovements` hardcode Brazilian context (CDC/LGPD, 15–30 business days, "R$", green Vessel theme) regardless of `target_language`. For a JP/other store this produces wrong legal/marketing content. Parameterize the locale-specific facts (return period, legal framework name, currency, business-day estimate) by `target_language`/country. (For Japan specifically: 特定商取引法 page, 8-day return norm, JPY.)

5. **Wire WooCommerce & Shoplazza into the generic import pipeline.** They're currently clone-only; the multi-site page advertises them but forces `sourceType:"generic_site"` (HTML scrape, lossy). Add `isWooCommerceStore`/`isShoplazzaStore` detection to `importFromSource` so bulk/multi-site can use their Store APIs (with SKUs).

6. **SKU-integrity check + repair surfaced in the UI.** Add a one-click "verify route health" that reports SKU parity between vitrine and checkout store, missing SKUs, and stale `variant_map` entries (the `repair`/`health` endpoints already compute most of this). Route breakage is currently silent until a customer fails to check out.

## P2 — security, cost, polish

7. **`public_token` hardening.** `resolve`/`track-fallback` are wide-open CORS with only the unguessable token as auth; anyone with the token can enumerate a route's resolved variant ids by POSTing arbitrary lines. Consider rate-limiting per token and not echoing full maps.

8. **Credit gating is inconsistent.** The deferred image queue debits credits, but inline neutralization inside `publishImportedProduct` (bulk/clone) does not. Unify cost control so all Gemini image calls go through the same credit path.

9. **Complete `.env.example`.** Missing (but required in code): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `BILLING_ENFORCED`, `ACCESS_CONTROL_ENABLED`, `BULK_IMPORT_CRON_SECRET`. A fresh deploy silently breaks billing without these.

10. **Fix pricing/copy inconsistencies.** `PRO_PRICE_USD=17` vs strings still saying "R$89/mês"; landing/billing copy should be single-sourced from `plans.ts`.

11. **AliExpress reviews are a stub** (`/api/aliexpress/reviews` returns hardcoded fake reviews). Either implement real review scraping or remove/relabel the feature so it isn't mistaken for real data.

## Product / growth ideas

12. **Native theme injection for the loader.** Automate the `update-theme` step end-to-end from the wizard (detect theme, inject `<script>`, verify) so users never hand-edit `theme.liquid`.
13. **Multi-currency vitrine → per-market checkout store routing.** One vitrine could route to different checkout stores by geo/currency.
14. **Route observability dashboard.** Surface `routed_checkout_fallbacks` trends (fallback reasons over time) so drops in routing success are caught early.
15. **Post-neutralization QA pass.** An automated check that the checkout store has zero brand tokens left in titles/descriptions/tags before a route is enabled.
