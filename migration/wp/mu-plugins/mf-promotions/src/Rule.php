<?php

declare(strict_types=1);

namespace MellowFellow\Promotions;

/**
 * A normalized promotion rule — framework-independent. The WooCommerce adapter (and,
 * later, our Promotions admin) is responsible for producing these from stored config.
 */
final class Rule
{
    public const TYPE_AUTO_PERCENT       = 'auto_percent';
    public const TYPE_AUTO_FIXED_PRODUCT = 'auto_fixed_product';
    public const TYPE_AUTO_FIXED_CART    = 'auto_fixed_cart';
    public const TYPE_BOGO               = 'bogo';
    public const TYPE_FREE_GIFT          = 'free_gift';

    public const EXCL_EXCLUSIVE = 'exclusive';
    public const EXCL_UNIVERSAL = 'universal';

    /**
     * @param int[]        $scopeProducts
     * @param int[]        $scopeCategories
     * @param int[]        $excludeProducts
     * @param int[]        $excludeCategories
     * @param array|null   $bogo  ['select'=>cheapest|expensive|same,'discount_type'=>free|perc|price|final,
     *                             'perc'=>float,'price'=>float,'final'=>float,'gets_qty'=>int,
     *                             'apply'=>once|repeatedly|custom,'repeat_times'=>int,'triggers'=>qty|amount,
     *                             'min_qty'=>int,'min_amount'=>float,'custom'=>[[min,max,times],...]]
     * @param array|null   $gift  ['threshold'=>float]
     */
    public function __construct(
        public readonly string $id,
        public readonly string $label,
        public readonly string $type,
        public readonly int $priority = 10,
        public readonly string $exclusivity = self::EXCL_UNIVERSAL,
        public readonly float $amount = 0.0,
        public readonly array $scopeProducts = [],
        public readonly array $scopeCategories = [],
        public readonly array $excludeProducts = [],
        public readonly array $excludeCategories = [],
        public readonly ?float $minSubtotal = null,
        public readonly ?int $minQty = null,
        public readonly ?array $bogo = null,
        public readonly ?array $gift = null,
    ) {
    }

    public static function fromArray(array $d): self
    {
        return new self(
            (string) ($d['id'] ?? ''),
            (string) ($d['label'] ?? ($d['id'] ?? '')),
            (string) ($d['type'] ?? ''),
            (int) ($d['priority'] ?? 10),
            (string) ($d['exclusivity'] ?? self::EXCL_UNIVERSAL),
            (float) ($d['amount'] ?? 0),
            array_map('intval', $d['scope_products'] ?? []),
            array_map('intval', $d['scope_categories'] ?? []),
            array_map('intval', $d['exclude_products'] ?? []),
            array_map('intval', $d['exclude_categories'] ?? []),
            isset($d['min_subtotal']) ? (float) $d['min_subtotal'] : null,
            isset($d['min_qty']) ? (int) $d['min_qty'] : null,
            $d['bogo'] ?? null,
            $d['gift'] ?? null,
        );
    }

    /** Does a line fall within this rule's product/category scope (and not excluded)? */
    public function matches(Line $line): bool
    {
        $pid = $line->productId;
        $vid = $line->variationId;

        if ($this->excludeProducts && (in_array($pid, $this->excludeProducts, true) || ($vid && in_array($vid, $this->excludeProducts, true)))) {
            return false;
        }
        if ($this->excludeCategories && array_intersect($line->categoryIds, $this->excludeCategories)) {
            return false;
        }
        if (empty($this->scopeProducts) && empty($this->scopeCategories)) {
            return true; // no positive scope => everything qualifies
        }
        if ($this->scopeProducts && (in_array($pid, $this->scopeProducts, true) || ($vid && in_array($vid, $this->scopeProducts, true)))) {
            return true;
        }
        if ($this->scopeCategories && array_intersect($line->categoryIds, $this->scopeCategories)) {
            return true;
        }
        return false;
    }
}
