# Promotion Resolver — Design & Rollout

Status: **Built and pushed behind a feature flag (OFF by default)** — 2026-09-09. Inert
on the site until enabled; WebToffee behaves exactly as today until then.

## How to enable / disable

- Enable: set option `mf_promo_resolver_enabled` = `yes` (or define `MF_PROMO_RESOLVER_ENABLED`
  true). Disable: set it back to `no` / remove the constant. Flipping it off instantly
  restores WebToffee's runtime — a one-switch rollback.
- When enabled, the resolver removes only WebToffee's *runtime* hooks (auto-apply +
  BOGO discount application); authoring screens and coupon records are untouched.

## Problem

Mellow Fellow is headless: the cart runs on the WooCommerce **Store API**. On every
cart request the Store API re-validates every applied coupon and **removes** any that
are momentarily invalid (`CartController::validate_cart_coupons` → `remove_coupon`).
This is core WooCommerce behavior, not a plugin bug.

WebToffee Smart Coupons implements automatic promotions (auto-apply %, BOGO) by
**re-applying a coupon on every `calculate_totals`**, and it decides "should I re-run?"
from a hash that includes the applied-coupon set. So:

1. `calculate_totals` → WebToffee auto-applies `foreverfalltest`
2. Store API `validate_cart_coupons` removes it (invalid for this cart)
3. the removal changes the coupon set → changes WebToffee's hash → auto-apply fires again → back to 1

Captured via `mf-discount-forensics` backtraces: this loop runs ~13× per request. It
(a) floods the cart with "not applicable" notices, (b) evicts the free-gift coupon in the
churn, and (c) multiplies `calculate_totals` — the direct cause of add-to-cart /
add-bundle timeouts ("store is taking longer than usual").

This is a structural incompatibility between "automatic discount as a re-applied coupon"
and the Store API. Switching coupon plugins does not fix it; the *pattern* is the problem.

## Principle

> Customer-typed codes stay as native WooCommerce coupons. **Automatic** promotions are
> computed once, server-side, as the final cart **line prices** — never as coupons that
> re-apply and get re-validated.

Recomputing a price is **idempotent**: run it once or ten times per request, the result
is identical, there is no coupon object for the Store API to remove, and there is no
churn. This also collapses the per-request `calculate_totals` work, fixing the timeouts.

## Architecture

A single mu-plugin (`mellow-fellow-promotion-resolver.php`) that:

1. **Hands automatic-promotion runtime from WebToffee to the resolver.** Removes only
   WebToffee's *runtime* hooks (`woocommerce_after_calculate_totals → maybe_apply_auto_coupons`,
   `woocommerce_check_cart_items`, and the BOGO `woocommerce_coupon_get_discount_amount` /
   giveaway hooks). WebToffee's **authoring screens and coupon records stay fully intact.**
2. **Recomputes promotions on `woocommerce_before_calculate_totals`.** For each rule, in
   priority order, adjusts eligible line prices via `WC_Product::set_price()`.
3. **Reads the base (undiscounted) price from `_price` postmeta**, not the cart's product
   object — this is what guarantees idempotency (set_price never feeds back in).
4. **Protects bundle items (`bb_group_key`) and the free gift** — never discounted by an
   automatic promotion.
5. **Publishes the applied promotions** to the Store API cart response
   (`woocommerce_store_api_register_endpoint_data`, namespace `mellow-fellow-promotions`)
   so the frontend can render chips.

### Eligibility = WC core validity

A rule is applied only when `WC_Discounts::is_coupon_valid()` passes for the current cart
— the *exact* check the Store API runs. So a resolver-applied promotion can never be in a
state the Store API considers invalid. Per-line scope uses `WC_Coupon::is_valid_for_product()`,
which also runs our existing `woocommerce_coupon_is_valid_for_product` guardrail.

## Authoring stays with marketing (unchanged)

- **Regular / auto-apply coupons** → Smart Coupons → All coupons (Marketing → Coupons).
  The **"auto apply"** option works exactly as before — the resolver reads that flag
  (`_wt_make_auto_coupon`) and applies the coupon.
- **BOGO offers** → Smart Coupons → BOGO screen. Stored as `shop_coupon` records with
  `wbte_sc_bogo_*` meta; the resolver reads that meta to execute the BOGO.
- **Manual promo codes** → unchanged; still native WooCommerce coupons, still removable.

We add three optional fields to the coupon editor to make stacking explicit:
`Automatic?`, `Priority`, `Exclusivity` (exclusive / stacks-with / universal).

**Coupling note:** reading `wbte_sc_bogo_*` meta couples us to WebToffee's format. It is
read-only, and the plugin version should be pinned. Full decoupling (our own authoring
screen) is an optional later step; not required to fix the war.

## UI: chips stay, but automatic ones lock

The cart response carries `extensions["mellow-fellow-promotions"].promotions = [{ label,
amount, removable:false }]`. The frontend renders:
- **Automatic promotions** → chip with name + savings, **no × button** (optionally a lock
  icon / "Automatic" tag).
- **Typed codes** → same chip **with** the × button.

Display continuity is preserved; only the automatic chips can't be clicked off (correct,
sale-like behavior — and the removability was what fueled the bug).

## Promotion types

| Type | Authoring | Resolver execution | Status |
|------|-----------|--------------------|--------|
| Auto % off (foreverfall) | coupon + auto-apply flag | line price × (1 − pct) on eligible lines; base = sale price when on sale | **DONE + tested** |
| BOGO cheapest / expensive (hercbogo) | WebToffee BOGO screen | read `wbte_sc_bogo_*`; sort eligible (excl. bundle+gift), discount N units by frequency; supports all 4 "customer gets" types (free / % / fixed-off / final-price) and apply once/repeatedly/custom | **DONE + tested** |
| BOGO BXGX (same product) | WebToffee BOGO screen | port next | **skip + log** (fail-safe) |
| BOGO BXGY (giveaway a different product / any-from-category / any-from-store, choose-your-free popup) | WebToffee BOGO screen | add-item + price 0; needs the choose-gift UI for popup variants | **skip + log** (fail-safe) |
| Free gift | existing threshold/collection config | set gift line price = 0 when pre-discount subtotal ≥ threshold; else remove gift | **next** (protection already wired) |
| Non-percent auto coupons (fixed cart/product) | coupon + auto-apply flag | port next | **skip** (only percent auto handled now) |
| Typed codes | native coupon | untouched — WooCommerce handles it | native |

**Fail-safe:** any BOGO mode not yet ported, or config the adapter can't read against the
tested WebToffee version, is **skipped and logged** (`mf-promo-resolver` log source) — never
applied with a guessed amount. Fail-safe, never fail-wrong.

### Local test coverage (resolver_test2.php, all passing)

- auto-%: correct 20% off eligible lines, non-qualifying untouched, **idempotent** across
  3 recalcs, **zero coupons applied** (no war)
- BOGO cheapest/repeat: 3 units → 1 cheapest free ($19.99); qty 4 → 2 free ($39.98);
  **bundle line never chosen** as the free item
- fail-safe: a BXGX coupon → config `null`, skipped + logged
- feature flag respected

Stacking: rules run in `Priority` order; an `exclusive` rule claims its lines so lower
rules skip them. Bundle + gift lines are always protected unless a rule explicitly
targets them.

## POC results (local, against prod copy)

Auto-% rule, cart = Relief Gummies (edible) + Seltzer (beverage) + Charged Pineapple
(neither) + a bundle-flagged Relief Gummies:

- Edible 19.99 → 15.99, Beverage 19.99 → 15.99 ✓
- Non-qualifying line untouched (44.99) ✓
- Bundle line **protected** (stays 19.99) ✓
- **Zero coupons applied** — no coupon war ✓
- **Idempotent** — subtotal identical across 3 recalcs ✓
- Promo chip reports correct savings ($8.00), `removable:false` ✓
- Non-qualifying cart: no discount, no error, no coupons ✓

## Rollout plan

1. **Behind a flag.** Ship the resolver disabled by default (constant/option). Enable on
   the staging site, run the forensics logger, confirm zero `COUPON REMOVED` churn and no
   "not applicable" flood through the full flow (add items → gift → BOGO → bundle → checkout).
2. **Add BOGO + gift execution** to the resolver (reading existing config), each validated
   with the same CLI harness before enabling.
3. **Add the three admin fields** (Automatic / Priority / Exclusivity).
4. **Acumatica:** line-price adjustments map to line-level discounts — already handled by
   the Scheme B logic in `mellow-fellow-acumatica-orders.php`; verify order push totals.
5. Once stable, retire WebToffee's runtime for auto-apply + BOGO (authoring stays).
6. Remove the temporary forensics loggers.

## Risks / open items

- **Idempotency depends on the base-price source.** We read `_price` postmeta; verify for
  variations and for products already on a sale price (decide: % off sale price vs regular).
- **BOGO fidelity.** WebToffee BOGO has many modes; implement only the modes marketing
  uses (cheapest-free-repeat is the current one) and test each.
- **Tax display.** Line-price adjustment changes taxable base; confirm tax lines and the
  frontend gross/net "You saved" math still reconcile.
- **Coupling to `wbte_sc_bogo_*`** meta format — pin plugin version; revisit if decoupling.

## Files

- `migration/wp/mu-plugins/mellow-fellow-promotion-resolver.php` — the resolver (deployed,
  flag OFF). All WebToffee meta reads are isolated in `mf_resolver_read_bogo_config()` —
  the single place to update if the schema changes, and the seam for the future migration
  to our own meta (full decoupling).
- CLI proof harness: `resolver_test2.php` (scratchpad).
