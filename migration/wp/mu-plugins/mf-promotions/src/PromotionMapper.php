<?php

declare(strict_types=1);

namespace MellowFellow\Promotions;

/**
 * Pure, framework-independent mapping between three representations:
 *   1. WebToffee/coupon config (plain arrays the WP adapter reads from post meta)
 *   2. our canonical `mf_promotion` array (what we store + what the admin edits)
 *   3. the engine `Rule`
 *
 * Keeping this pure means the migration transform and the runtime read share ONE tested
 * code path: WebToffee -> mf_promotion (importer) and mf_promotion -> Rule (reader) are both
 * here, unit-tested, with no WordPress calls. The WP layer only supplies plain arrays.
 *
 * The canonical `mf_promotion` array shape:
 *   [
 *     'source_id'          => int,     // source coupon/BOGO post id (idempotency key)
 *     'code'               => string,  // original code, for reference
 *     'label'              => string,
 *     'type'               => auto_percent|auto_fixed_product|auto_fixed_cart|bogo|free_gift,
 *     'status'             => active|inactive,
 *     'priority'           => int,
 *     'exclusivity'        => exclusive|universal,
 *     'amount'             => float,       // auto types
 *     'min_subtotal'       => float|null,
 *     'scope_products'     => int[],
 *     'scope_categories'   => int[],
 *     'exclude_products'   => int[],
 *     'exclude_categories' => int[],
 *     'bogo'               => array|null,  // engine bogo config
 *     'gift'               => array|null,  // ['threshold'=>float]
 *   ]
 */
final class PromotionMapper
{
    /** mf_promotion array -> engine Rule (the runtime reader). */
    public static function toRule(array $p): Rule
    {
        return Rule::fromArray([
            'id'                => (string) ($p['code'] ?? $p['source_id'] ?? ''),
            'label'             => (string) ($p['label'] ?? ''),
            'type'              => (string) ($p['type'] ?? ''),
            'priority'          => (int) ($p['priority'] ?? 10),
            'exclusivity'       => (string) ($p['exclusivity'] ?? Rule::EXCL_UNIVERSAL),
            'amount'            => (float) ($p['amount'] ?? 0),
            'scope_products'    => $p['scope_products'] ?? [],
            'scope_categories'  => $p['scope_categories'] ?? [],
            'exclude_products'  => $p['exclude_products'] ?? [],
            'exclude_categories' => $p['exclude_categories'] ?? [],
            'min_subtotal'      => $p['min_subtotal'] ?? null,
            'bogo'              => $p['bogo'] ?? null,
            'gift'              => $p['gift'] ?? null,
        ]);
    }

    /**
     * WebToffee auto-apply coupon -> mf_promotion array.
     *
     * @param array $d [
     *   'source_id','code','label','discount_type'(percent|fixed_product|fixed_cart),
     *   'amount','priority','exclusive'(bool),'min_amount','status'(active|inactive),
     *   'scope_products','scope_categories','exclude_products','exclude_categories'
     * ]
     */
    public static function fromWebToffeeAuto(array $d): array
    {
        $typeMap = [
            'percent'       => Rule::TYPE_AUTO_PERCENT,
            'fixed_product' => Rule::TYPE_AUTO_FIXED_PRODUCT,
            'fixed_cart'    => Rule::TYPE_AUTO_FIXED_CART,
        ];
        return [
            'source_id'          => (int) ($d['source_id'] ?? 0),
            'code'               => (string) ($d['code'] ?? ''),
            'label'              => (string) ($d['label'] ?? ($d['code'] ?? '')),
            'type'               => $typeMap[$d['discount_type'] ?? ''] ?? '',
            'trigger'            => 'automatic', // auto-apply coupons are always automatic
            'status'             => ($d['status'] ?? 'active') === 'active' ? 'active' : 'inactive',
            'priority'           => (int) ($d['priority'] ?? 20),
            'exclusivity'        => !empty($d['exclusive']) ? Rule::EXCL_EXCLUSIVE : Rule::EXCL_UNIVERSAL,
            'amount'             => (float) ($d['amount'] ?? 0),
            'min_subtotal'       => !empty($d['min_amount']) ? (float) $d['min_amount'] : null,
            'scope_products'     => self::ints($d['scope_products'] ?? []),
            'scope_categories'   => self::ints($d['scope_categories'] ?? []),
            'exclude_products'   => self::ints($d['exclude_products'] ?? []),
            'exclude_categories' => self::ints($d['exclude_categories'] ?? []),
            'bogo'               => null,
            'gift'               => null,
        ];
    }

    /**
     * WebToffee BOGO meta -> mf_promotion array, or null for a giveaway mode not yet
     * ported (the caller logs + skips). $meta is the raw wbte_sc_bogo_* values.
     *
     * @param array $meta raw meta values keyed by their wbte_sc_bogo_* names + our context:
     *   'source_id','code','priority','exclusive','status',
     *   'scope_products','scope_categories','exclude_products','exclude_categories'
     */
    public static function fromWebToffeeBogo(array $meta): ?array
    {
        $type = $meta['wbte_sc_bogo_type'] ?? '';
        $gets = $meta['wbte_sc_bogo_customer_gets'] ?? '';

        if ($type === 'wbte_sc_bogo_cheap_expensive') {
            $select = ($meta['wbte_sc_bogo_customer_gets_cheap_exp'] ?? '') === 'wbte_sc_bogo_customer_gets_expensive'
                ? 'expensive' : 'cheapest';
        } elseif ($type === 'wbte_sc_bogo_bxgx' && $gets === 'same_product') {
            $select = 'same';
        } else {
            return null; // giveaway of a different/chosen product -> Phase 3 UI
        }

        // Discount type.
        if (($meta['wbte_sc_bogo_customer_gets_with'] ?? '') === 'wbte_sc_bogo_customer_gets_with_final_price') {
            $discountType = 'final';
        } else {
            $dt = $meta['wbte_sc_bogo_customer_gets_discount_type'] ?? '';
            if ($dt === 'wbte_sc_bogo_customer_gets_free') {
                $discountType = 'free';
            } elseif ($dt === 'wbte_sc_bogo_customer_gets_with_perc_discount') {
                $discountType = 'perc';
            } else {
                $discountType = 'price';
            }
        }

        // Frequency.
        $applyRaw = $meta['wbte_sc_bogo_apply_offer'] ?? '';
        $apply = 'once';
        if ($applyRaw === 'wbte_sc_bogo_apply_repeatedly') {
            $apply = 'repeatedly';
        } elseif ($applyRaw === 'wbte_sc_bogo_apply_custom') {
            $apply = 'custom';
        }

        $custom = [];
        if ($apply === 'custom') {
            $mins  = self::csv($meta['wbte_sc_bogo_apply_custom_min'] ?? '');
            $maxs  = self::csv($meta['wbte_sc_bogo_apply_custom_max'] ?? '');
            $times = self::csv($meta['wbte_sc_bogo_apply_custom_times'] ?? '');
            foreach ($mins as $i => $min) {
                $custom[] = [
                    'min'   => (float) $min,
                    'max'   => (float) ($maxs[$i] ?? 0),
                    'times' => (int) ($times[$i] ?? 0),
                ];
            }
        }

        $bogo = [
            'select'        => $select,
            'discount_type' => $discountType,
            'perc'          => (float) ($meta['wbte_sc_bogo_customer_gets_discount_perc'] ?? 0),
            'price'         => (float) ($meta['wbte_sc_bogo_customer_gets_discount_price'] ?? 0),
            'final'         => (float) ($meta['wbte_sc_bogo_customer_gets_final_price'] ?? 0),
            'gets_qty'      => (int) ($meta['wbte_sc_bogo_customer_gets_qty'] ?? 0),
            'apply'         => $apply,
            'repeat_times'  => (int) ($meta['wbte_sc_bogo_repeatedly_times'] ?? 0),
            'triggers'      => ($meta['wbte_sc_bogo_triggers_when'] ?? '') === 'wbte_sc_bogo_triggers_amount' ? 'amount' : 'qty',
            'min_qty'       => (int) ($meta['_wbte_sc_bogo_min_qty'] ?? 0),
            'min_amount'    => (float) ($meta['_wbte_sc_bogo_min_amount'] ?? 0),
            'custom'        => $custom,
        ];

        $label = $meta['wbte_sc_bogo_coupon_name'] ?? '';
        return [
            'source_id'          => (int) ($meta['source_id'] ?? 0),
            'code'               => (string) ($meta['code'] ?? ''),
            'label'              => $label !== '' ? (string) $label : strtoupper((string) ($meta['code'] ?? '')),
            'type'               => Rule::TYPE_BOGO,
            'trigger'            => ($meta['trigger'] ?? 'automatic') === 'code' ? 'code' : 'automatic',
            'status'             => ($meta['status'] ?? 'active') === 'active' ? 'active' : 'inactive',
            'priority'           => (int) ($meta['priority'] ?? 30),
            'exclusivity'        => !empty($meta['exclusive']) ? Rule::EXCL_EXCLUSIVE : Rule::EXCL_UNIVERSAL,
            'amount'             => 0.0,
            'min_subtotal'       => null,
            'scope_products'     => self::ints($meta['scope_products'] ?? []),
            'scope_categories'   => self::ints($meta['scope_categories'] ?? []),
            'exclude_products'   => self::ints($meta['exclude_products'] ?? []),
            'exclude_categories' => self::ints($meta['exclude_categories'] ?? []),
            'bogo'               => $bogo,
            'gift'               => null,
        ];
    }

    /** Free-gift config -> mf_promotion array. */
    public static function fromFreeGift(array $d): array
    {
        return [
            'source_id'          => (int) ($d['source_id'] ?? 0),
            'code'               => (string) ($d['code'] ?? 'free-gift'),
            'label'              => (string) ($d['label'] ?? 'Free gift'),
            'type'               => Rule::TYPE_FREE_GIFT,
            'trigger'            => 'automatic',
            'status'             => ($d['status'] ?? 'active') === 'active' ? 'active' : 'inactive',
            'priority'           => (int) ($d['priority'] ?? 5),
            'exclusivity'        => Rule::EXCL_UNIVERSAL,
            'amount'             => 0.0,
            'min_subtotal'       => null,
            'scope_products'     => [],
            'scope_categories'   => [],
            'exclude_products'   => [],
            'exclude_categories' => [],
            'bogo'               => null,
            'gift'               => ['threshold' => (float) ($d['threshold'] ?? 0)],
        ];
    }

    /** @return int[] */
    private static function ints($v): array
    {
        if (is_array($v)) {
            return array_values(array_unique(array_map('intval', $v)));
        }
        if ($v === '' || $v === null) {
            return [];
        }
        return array_values(array_filter(array_map('intval', array_map('trim', explode(',', (string) $v)))));
    }

    /** @return string[] */
    private static function csv($v): array
    {
        if (is_array($v)) {
            return array_map('trim', $v);
        }
        return array_map('trim', explode(',', (string) $v));
    }
}
