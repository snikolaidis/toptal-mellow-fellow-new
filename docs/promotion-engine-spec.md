# Mellow Fellow Promotion Engine — Authoritative Spec

> **LEAN PIVOT (2026-09-09).** We deliberately did NOT go to full ownership. Smart Coupons
> stays installed as the authoring tool and keeps every feature (BOGO/coupon screens, import,
> bulk generate, URL coupons, banners, **store credit**). The engine's job is narrow: replace
> only WebToffee's **auto-apply + BOGO runtime** (the two behaviors that fought the Store API),
> computing them deterministically from WebToffee's **live** config (`source = webtoffee`).
> The own-authoring pieces below (mf_promotion CPT, unified admin, migration importer,
> PromotionMapper) were built, validated, then **removed** — they're recoverable from git if we
> ever choose full ownership. What remains and runs: the pure engine core (`mf-promotions/src`:
> Line/Rule/Result/PromotionEngine) + the WooCommerce adapter (`mellow-fellow-promotion-resolver.php`).
> Sections 2, 5 and the migration design below describe the shelved full-ownership path and are
> retained for reference only.

Status: **Approved architecture (2026-09-09).** Supersedes the resolver POC design doc for
scope; the resolver becomes the engine's execution core. This is the contract the build,
the test suite, and marketing all follow.

Decisions locked with ownership:
- **Build** a custom, deterministic, server-side promotion engine (not buy / not a plugin).
- **Own authoring** — a custom promotions admin; decoupled from WebToffee; migrate existing
  definitions in.
- **Full engineering rigor** — automated tests + CI + staging + load testing + observability
  + a launch-readiness gate.

Non-negotiable goal: marketing gets Shopify-level autonomy and the store gets enterprise
reliability. No band-aids. Problems are caught in CI/staging, never by customers; every
change is feature-flagged with instant rollback.

---

## 1. Principles

1. **One promotion authority.** A single engine computes the final cart in ONE deterministic,
   idempotent pass on every calculation. Automatic promotions are applied as line PRICES, not
   as re-applied coupons — so WooCommerce's Store API coupon re-validation has nothing to fight
   (the root cause of the current war, notice floods, gift eviction, and cart timeouts).
2. **Customer-typed codes stay native.** Only codes a shopper enters are WooCommerce coupons.
3. **Deterministic stacking.** Every promotion declares scope, priority, exclusivity, and
   guardrails. The engine resolves conflicts the same way every time.
4. **Protected lines.** Build-a-bundle components and the free gift are never cannibalized
   unless a rule explicitly targets them.
5. **Fail-safe, never fail-wrong.** Anything the engine can't evaluate cleanly is skipped and
   logged/alerted — never applied with a guessed amount.
6. **Owned definitions.** Promotions are stored in our own schema. No third-party plugin update
   can change pricing behavior.

---

## 2. Domain model

A **Promotion** record (custom post type `mf_promotion`) carries:

| Field | Meaning |
|-------|---------|
| `type` | `auto_percent` · `auto_fixed_product` · `auto_fixed_cart` · `bogo` · `free_gift` |
| `trigger` | how it activates: `automatic` (always on when eligible) or `code` (customer enters a code) |
| `scope` | products / categories / collections it applies to (include + exclude) |
| `conditions` | min subtotal / min qty / category-combination (AND/OR) / date window / usage limits / customer segment |
| `bogo_config` | (bogo only) buy set, get set, buy qty, get qty, cheapest/expensive/same/specific/any-from-category/any-from-store, discount (free / % / fixed-off / final-price), apply once/repeatedly/custom-ranges |
| `gift_config` | (free_gift only) threshold (evaluated on **pre-discount** subtotal), eligible gift collection, max gift price |
| `priority` | integer; lower runs first (determines stacking math) |
| `exclusivity` | `exclusive` (nothing else stacks on a claimed line) · `stacks_with:[ids]` · `universal` |
| `guardrail` | optional per-line margin floor / max discount |
| `status` | draft / active / scheduled / expired |

**Stacking resolution:** rules sorted by `priority`; each line tracks which promotions have
touched it; an `exclusive` rule claims its lines so later rules skip them; `stacks_with`
enforces the compatibility matrix; guardrails cap the final per-line discount.

---

## 3. Promotion types & modes (ALL first-class — no "skip")

Marketing has agreed we may activate the currently-inactive offers so every mode is built and
tested against real config.

### 3.1 Automatic discounts
- **auto_percent** — % off eligible lines. Base = **sale price** when on sale, else regular.
- **auto_fixed_product** — fixed amount off each eligible unit (capped at unit price).
- **auto_fixed_cart** — fixed amount off the cart, distributed across eligible lines in
  proportion to value, capped so no line goes negative.

### 3.2 BOGO (all variants)
- **cheapest / expensive** — buy N, the cheapest/most-expensive eligible unit(s) get the
  discount; apply once / repeatedly / custom-ranges. *(built + tested)*
- **same product (BXGX)** — buy N of a product, get M of the same at the discount. If the free
  units aren't in the cart, they are added.
- **specific different product (BXGY)** — buy from set X, get specific product Y; Y is added to
  the cart (giveaway) at the discount and removed when the condition lapses.
- **any from category / any from store (choose-your-free)** — customer selects the free item
  from an eligible set via a cart UI (same pattern as the free-gift picker).
- **Discount types (all):** free (100%) · % off · fixed-$ off · final fixed price.
- Bundle + gift lines are never selected as the free/discounted item.

### 3.3 Free gift
- Threshold evaluated on **pre-discount** subtotal (excludes the gift's own line) so other
  promotions can never push the cart under the threshold and evict the gift.
- Gift line priced to 0; removed if the cart drops below threshold.
- Customer picks from an eligible collection (existing picker, hardened).

### 3.4 Customer-typed codes
- Native WooCommerce coupons, unchanged; always removable chips.

---

## 4. Frontend contract

- The Store API cart response carries `extensions["mellow-fellow-promotions"]`:
  `{ promotions: [{ id, label, amount, removable }], offers: [{ id, type, choose: {...} }] }`.
- **Chips:** automatic promotions render as a chip with name + savings and **no × (locked)**;
  typed codes render with the ×. Display continuity with today.
- **Choose-your-free / giveaway:** when an offer is unlocked, the cart shows a picker (reused
  free-gift widget pattern); the chosen item is added server-side with a marker and priced by
  the engine. Bounded, idempotent, no request storms (the FreeGiftWidget retry-storm fix and
  its verification pattern are the baseline).

---

## 5. Authoring (marketing)

- Custom **Promotions** admin (list + editor) mapping 1:1 to the domain model, with a
  stacking/exclusivity picker and a live "what this does" preview.
### Migration importer (precise design)

- **Separate storage — no duplication.** Promotions are `mf_promotion` posts, NOT
  `shop_coupon`. The importer never writes to the coupon table; existing WebToffee coupons and
  BOGO offers stay untouched. No duplicate/ambiguous coupon codes are ever created.
- **Idempotent.** Each `mf_promotion` stores `source_coupon_id`. Re-running updates the
  matching record rather than creating a new one — safe to run repeatedly.
- **What migrates:** automatic promotions only — auto-apply %/fixed coupons, BOGO offers
  (from the BOGO screen; stored as `shop_coupon` + `wbte_sc_bogo_*` meta, incl. our
  `_mf_bogo_collections`), and the free-gift config.
- **What does NOT migrate:** customer-typed codes (coupons a shopper enters) remain native
  WooCommerce coupons and keep working under Marketing → Coupons.
- **Status preserved:** active → active, inactive/draft → inactive `mf_promotion` (engine only
  applies active). Expired/trashed skipped by default.
- **Cutover safety:** when Smart Coupons is deactivated, the importer disables the source
  auto-apply + BOGO coupons it migrated, so nothing applies twice (old native + new engine).
  Typed codes untouched. Run on the no-users site first; produce a before/after diff for
  approval; only then cut over. WebToffee runtime is already disabled by the flag; the plugin
  is deactivated only after the diff is verified.

---

## 6. Integrations

- **WC Bundle Builder:** bundle lines (`bb_group_key`) are protected; bundle pricing is the
  bundle's own. Verified by tests.
- **Acumatica:** engine line-price adjustments map to line-level discounts; document-wide
  promos map to Acumatica document discounts (existing Scheme B). Order-push totals verified
  in sandbox per promotion type.
- **Tax:** because we set real line prices, WooCommerce recomputes tax on the discounted price
  automatically (confirmed desired behavior).

---

## 7. Engineering rigor (the part that prevents daily hotfixes)

- **Unit tests (PHPUnit):** every promotion type, every BOGO variant, every discount type,
  every stacking/exclusivity/priority combination, protection of bundle/gift, guardrails,
  idempotency, and the fail-safe path. A promotion-math test matrix is the spec's teeth.
- **Integration tests:** against a real WooCommerce install (wp-env), driving the Store API the
  way the frontend does — assert no coupon churn, correct totals, correct cart extension data.
- **E2E (Playwright):** full add → promotions → gift/giveaway → bundle → checkout on staging.
- **CI (GitHub Actions):** the above run on every PR; no merge on red.
- **Load/performance:** k6/Playwright load tests on cart + checkout; WPE object cache enabled,
  PHP worker sizing validated, query hotspots (store-locator, GraphQL) audited, CDN/caching/ISR
  verified. Target p95 cart op well under the timeout that's currently firing.
- **Observability:** structured logging + alerting on cart failures, coupon/engine errors,
  slow queries; a dashboard for cart op latency and promotion application.
- **Feature flags + rollback:** the engine and each risky change are flag-gated; rollback is one
  switch. Rollback drills before launch.
- **Launch-readiness gate:** a signed checklist (functional, performance, observability,
  rollback, staging/prod split) before real customers.

---

## 8. Phased delivery

- **Phase 0 — Foundations:** this spec; wp-env test harness; PHPUnit + CI skeleton; port the
  existing CLI proofs into the suite. *(starting now)*
- **Phase 1 — Engine core:** domain model + `mf_promotion` CPT + resolver covering all §3 modes,
  full unit coverage. Behind the flag.
- **Phase 2 — Authoring + migration:** Promotions admin + importer from WebToffee/coupons.
- **Phase 3 — Frontend:** chips + giveaway/choose-your-free picker; E2E on staging.
- **Phase 4 — Cutover:** disable WebToffee runtime; verify Acumatica + tax; enable on the
  no-users staging site; soak.
- **Phase 5 — Performance + launch gate:** load test, infra hardening, observability, staging/
  prod split, checklist sign-off.

---

## 9. What's needed from the business

- WP Engine access to the staging(-called-prod) site + confirmation to enable the engine and
  activate the inactive promotions there for testing.
- Marketing's **full promotions requirements catalog** — the promo types/scenarios they must be
  able to run (so the engine and admin cover real needs, not just current test coupons).
- Confirmation to add GitHub Actions CI workflows to the repo.
- WP Engine settings actions: enable object cache, confirm PHP worker plan, disable plugin
  auto-updates (pin versions).
