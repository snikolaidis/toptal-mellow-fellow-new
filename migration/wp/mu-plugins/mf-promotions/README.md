# Mellow Fellow Promotion Engine (core)

Deterministic, **framework-independent** promotion resolver. No WordPress/WooCommerce
dependency, so it is fast and exhaustively unit-testable. The WooCommerce mu-plugin
(`mellow-fellow-promotion-resolver.php`) is a thin adapter that builds `Line[]` from the
cart and `Rule[]` from stored promotions, calls `PromotionEngine::resolve()`, and applies
the returned per-line discounts as line prices.

See `../../../../docs/promotion-engine-spec.md` for the full spec.

## Run the tests

```bash
composer install
composer test      # or: vendor/bin/phpunit
```

CI runs the suite on every change under this directory
(`.github/workflows/promotion-engine-tests.yml`).

## Design

- `src/Line.php` — a cart line (base per-unit price = sale price when on sale). Immutable.
- `src/Rule.php` — a normalized promotion (type, scope, priority, exclusivity, conditions,
  bogo/gift config).
- `src/PromotionEngine.php` — `resolve(Line[], Rule[]): Result`. Priority-ordered,
  idempotent, caps each line at its total, protects bundle + gift lines.
- `src/Result.php` — per-line discounts + the list of applied promotions (for cart chips).

## Covered modes (unit-tested)

auto percent · auto fixed-per-product · auto fixed-cart (proportional) · BOGO
cheapest/expensive/same-product · discount types free / % / fixed-off / final-price ·
apply once / repeatedly / custom-ranges · free gift (pre-discount threshold) · bundle &
gift protection · priority + exclusivity stacking · idempotency.
