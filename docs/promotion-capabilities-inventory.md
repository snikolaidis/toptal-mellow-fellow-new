# Promotion Capabilities — Requirements & Coverage Matrix

Requirement, stated by the business: **match what WebToffee Smart Coupons Pro can do** —
"whatever Smart Coupons provides is what we want to be able to do." This matrix is derived
from the plugin's own module set, the current DB config, and Danisha's team's Aug 2026
testing feedback. It is the traceable scope the engine + admin must satisfy.

Legend: **Engine** = handled by the promotion engine (line pricing). **Native** = a
WooCommerce coupon feature we keep. **Admin** = authoring/tooling in our Promotions admin.
**Subsystem** = a separate system that must coexist (not core line-pricing). **Display** =
frontend presentation. **Later** = planned, not first cutover.

## Smart Coupons module → coverage

| Smart Coupons module | What it does | Our plan |
|---|---|---|
| auto_coupon | Auto-apply discounts (%/fixed) | **Engine** — auto_percent / auto_fixed_product / auto_fixed_cart ✅ built+tested |
| bogo | Buy-X-Get: cheapest/expensive, same, specific, any-from-category/store; free/%/fixed/final | **Engine** — cheapest/expensive/same + all discount types ✅ built+tested; specific/any (giveaway) pricing ✅, **add-to-cart + choose-your-free UI = Phase 3** |
| giveaway_product | Free gift / giveaway a product | **Engine** — free_gift (pre-discount threshold) ✅ built+tested; collection/category selection = Phase 3 (team FR #5) |
| coupon_restriction | Product/category/collection scope, min/max, dates | **Engine** rule scope+conditions ✅ (+ our collection meta) |
| exclude_product | Exclusions | **Engine** exclude scope ✅ built+tested |
| usage_limit | Per-coupon / per-user usage limits | **Engine** conditions + **Native** for typed codes |
| nth_order | "Nth order" / new-vs-returning targeting | **Engine** condition (needs order history) — Later |
| combo_coupon | Which coupons can/can't combine | **Engine** — priority + exclusivity/stacks-with matrix ✅ (exclusivity built+tested) |
| url_coupon | Apply a coupon via URL | **Native/Frontend** — read `?coupon=` and apply — Later, simple |
| signup_coupon | Coupon on account signup | **Subsystem** (auth flow) — Later |
| coupon_shortcode / coupon_category / bulk_generate / import_coupon / duplicate_coupon / coupon_lifespan | Admin authoring conveniences (create/duplicate/expire/import/organize) | **Admin** — Promotions admin (Phase 2); expiry/scheduling = Engine condition |
| store_credit | Store-credit / wallet (team wants loyalty→store credit, FR #6) | **Subsystem** — wallet/tender-level; coexists with engine, not line-pricing. Decide keep-WebToffee vs build |
| gift_coupon | Gift-card style coupons | **Subsystem** (ties to store_credit) — Later |
| cart_abandonment | Abandoned-cart coupon emails | **Subsystem** (email/marketing) — out of engine scope |
| notifications / coupon_banner / banner / product_page_display / coupon_style | Promo messaging + banners + styling | **Display** — cart chips (Phase 3) + optional banners Later |
| checkout_options | Coupon field behavior at checkout | **Native/Frontend** |

## Team feedback (Aug 2026) → status

**Bugs (must die):**
1. Cart clearing on coupons → **root cause = the auto-apply↔StoreAPI war; the engine removes it structurally** (idempotent line pricing, no re-applied coupons). ✅ addressed by architecture; verify in Phase 4.
2. Auto-discount scope bug (one included item → whole cart discounted) → **Engine applies per-line by scope only.** ✅ built+tested (`testAutoPercentDiscountsEligibleLinesOnly`).
3. Free gift / threshold interference → **Engine: pre-discount threshold + gift protection.** ✅ built+tested (`testFreeGiftThresholdUsesPreDiscountSubtotalExcludingGift`).
4. Auto-refresh failure (prices don't update without reload) → **Engine is deterministic server-side; the cart response carries final prices + promotions, frontend re-renders.** ✅ by design; validate in Phase 3 E2E.
5. Header 404s → unrelated to promotions; track separately.

**Feature requests:**
1. Buy X Get Y (configurable X/Y qty + items) → **Engine BOGO** (specific/any giveaway) — pricing ✅, UI Phase 3.
2. Fixed-price promotions (e.g. sell 4ml at 2ml price) → **Engine BOGO `final` discount type** ✅ built+tested (`testBogoFinalPriceAndFixedOff`).
3. Per-coupon discount breakdown at checkout → **cart `promotions[]` (chips)** — Phase 3.
4. Dedicated free-shipping coupon type → **add `free_shipping` effect** (ties into existing force-free-shipping work) — Phase 1/2.
5. Giveaway by collection/category (not just single products) → **Engine + choose-your-free UI** — Phase 3.
6. Loyalty (Yotpo) as store credit to avoid stacking issues → **Subsystem: store credit/wallet** — design separately so it never enters the promotion-stacking path.
7. Collection Restrictions UI higher up → **our Promotions admin** (Phase 2) designs the layout.
8. Rule-based collection creation → tooling question; our admin can support saved rules — Later.

## Net

The engine already covers the core pricing scope + the top bugs (2, 3) and top FRs (2). The
remaining work is: BOGO giveaway **UI** + choose-your-free, chips/per-coupon breakdown,
free-shipping effect, the Promotions admin, and the store-credit subsystem decision — all in
the phased plan. Nothing in Smart Coupons' pricing scope is unaccounted for.
