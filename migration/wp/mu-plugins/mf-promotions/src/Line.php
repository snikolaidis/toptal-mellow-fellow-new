<?php

declare(strict_types=1);

namespace MellowFellow\Promotions;

/**
 * A cart line as the pure engine sees it — no WooCommerce dependency.
 *
 * `price` is the UNDISCOUNTED per-unit base price (the sale price when the product
 * is on sale, else the regular price). The engine never mutates it; discounts are
 * returned separately, which is what makes resolution idempotent.
 */
final class Line
{
    /** @param int[] $categoryIds */
    public function __construct(
        public readonly string $key,
        public readonly int $productId,
        public readonly int $variationId,
        public readonly float $price,
        public readonly int $qty,
        public readonly array $categoryIds = [],
        public readonly bool $isBundle = false,
        public readonly bool $isGift = false,
        /** Rule id this line was added as a giveaway for, if any. */
        public readonly ?string $giveawayForRule = null,
    ) {
    }

    public static function fromArray(array $d): self
    {
        return new self(
            (string) ($d['key'] ?? ''),
            (int) ($d['product_id'] ?? 0),
            (int) ($d['variation_id'] ?? 0),
            (float) ($d['price'] ?? 0),
            (int) ($d['qty'] ?? 0),
            array_map('intval', $d['category_ids'] ?? []),
            (bool) ($d['is_bundle'] ?? false),
            (bool) ($d['is_gift'] ?? false),
            isset($d['giveaway_for_rule']) ? (string) $d['giveaway_for_rule'] : null,
        );
    }

    public function lineTotal(): float
    {
        return $this->price * $this->qty;
    }

    /** Bundle components are never touched; gift lines only by their own free_gift rule. */
    public function isProtectedFromDiscounts(): bool
    {
        return $this->isBundle || $this->isGift;
    }
}
