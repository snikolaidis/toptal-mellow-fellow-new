<?php

declare(strict_types=1);

namespace MellowFellow\Promotions\Tests;

use MellowFellow\Promotions\Line;
use MellowFellow\Promotions\PromotionEngine;
use MellowFellow\Promotions\PromotionMapper;
use MellowFellow\Promotions\Rule;
use PHPUnit\Framework\TestCase;

final class PromotionMapperTest extends TestCase
{
    public function testFromWebToffeeAutoPercent(): void
    {
        $p = PromotionMapper::fromWebToffeeAuto([
            'source_id' => 10, 'code' => 'foreverfalltest', 'label' => 'Fall Sale',
            'discount_type' => 'percent', 'amount' => 20, 'priority' => 20, 'exclusive' => false,
            'min_amount' => 0, 'status' => 'active',
            'scope_categories' => [3286, 3287],
        ]);

        $this->assertSame(Rule::TYPE_AUTO_PERCENT, $p['type']);
        $this->assertSame(20.0, $p['amount']);
        $this->assertSame([3286, 3287], $p['scope_categories']);
        $this->assertSame('active', $p['status']);
        $this->assertNull($p['min_subtotal']);
    }

    public function testFromWebToffeeAutoFixedCartWithMin(): void
    {
        $p = PromotionMapper::fromWebToffeeAuto([
            'source_id' => 11, 'code' => 'x', 'discount_type' => 'fixed_cart',
            'amount' => 15, 'min_amount' => 100, 'status' => 'inactive',
        ]);

        $this->assertSame(Rule::TYPE_AUTO_FIXED_CART, $p['type']);
        $this->assertSame(100.0, $p['min_subtotal']);
        $this->assertSame('inactive', $p['status']);
    }

    public function testFromWebToffeeBogoCheapestMapsAndRunsCorrectly(): void
    {
        // Mirrors hercbogotest: cheapest, perc 100, repeatedly, min_qty 2.
        $p = PromotionMapper::fromWebToffeeBogo([
            'source_id' => 25688, 'code' => 'hercbogotest',
            'wbte_sc_bogo_type' => 'wbte_sc_bogo_cheap_expensive',
            'wbte_sc_bogo_customer_gets_cheap_exp' => 'wbte_sc_bogo_customer_gets_cheapest',
            'wbte_sc_bogo_customer_gets_with' => 'wbte_sc_bogo_customer_gets_with_discount',
            'wbte_sc_bogo_customer_gets_discount_type' => 'wbte_sc_bogo_customer_gets_with_perc_discount',
            'wbte_sc_bogo_customer_gets_discount_perc' => 100,
            'wbte_sc_bogo_customer_gets_qty' => 1,
            'wbte_sc_bogo_apply_offer' => 'wbte_sc_bogo_apply_repeatedly',
            'wbte_sc_bogo_triggers_when' => 'wbte_sc_bogo_triggers_qty',
            '_wbte_sc_bogo_min_qty' => 2,
            'status' => 'active',
        ]);

        $this->assertNotNull($p);
        $this->assertSame(Rule::TYPE_BOGO, $p['type']);
        $this->assertSame('cheapest', $p['bogo']['select']);
        $this->assertSame('perc', $p['bogo']['discount_type']);
        $this->assertSame(100.0, $p['bogo']['perc']);
        $this->assertSame('repeatedly', $p['bogo']['apply']);
        $this->assertSame(2, $p['bogo']['min_qty']);

        // Round-trip through the engine: 3 units -> 1 cheapest free.
        $rule = PromotionMapper::toRule($p);
        $engine = new PromotionEngine(2);
        $lines = [
            Line::fromArray(['key' => 'a', 'product_id' => 1, 'price' => 44.99, 'qty' => 1]),
            Line::fromArray(['key' => 'b', 'product_id' => 2, 'price' => 19.99, 'qty' => 1]),
            Line::fromArray(['key' => 'c', 'product_id' => 3, 'price' => 19.99, 'qty' => 1]),
        ];
        $this->assertSame(19.99, $engine->resolve($lines, [$rule])->totalDiscount());
    }

    public function testFromWebToffeeBogoSameProduct(): void
    {
        $p = PromotionMapper::fromWebToffeeBogo([
            'source_id' => 1, 'code' => 's',
            'wbte_sc_bogo_type' => 'wbte_sc_bogo_bxgx',
            'wbte_sc_bogo_customer_gets' => 'same_product',
            'wbte_sc_bogo_customer_gets_with' => 'wbte_sc_bogo_customer_gets_with_discount',
            'wbte_sc_bogo_customer_gets_discount_type' => 'wbte_sc_bogo_customer_gets_free',
            'wbte_sc_bogo_customer_gets_qty' => 1,
            'wbte_sc_bogo_apply_offer' => 'wbte_sc_bogo_apply_repeatedly',
            '_wbte_sc_bogo_min_qty' => 2,
        ]);

        $this->assertNotNull($p);
        $this->assertSame('same', $p['bogo']['select']);
        $this->assertSame('free', $p['bogo']['discount_type']);
    }

    public function testFromWebToffeeBogoGiveawayReturnsNull(): void
    {
        // bogotest26: BXGX with a specific DIFFERENT free product -> giveaway -> not yet ported.
        $p = PromotionMapper::fromWebToffeeBogo([
            'source_id' => 25683, 'code' => 'bogotest26',
            'wbte_sc_bogo_type' => 'wbte_sc_bogo_bxgx',
            'wbte_sc_bogo_customer_gets' => 'specific_product',
            'wbte_sc_bogo_free_product_ids' => '24556',
        ]);
        $this->assertNull($p);
    }

    public function testFromWebToffeeBogoCustomRanges(): void
    {
        $p = PromotionMapper::fromWebToffeeBogo([
            'source_id' => 1, 'code' => 'c',
            'wbte_sc_bogo_type' => 'wbte_sc_bogo_cheap_expensive',
            'wbte_sc_bogo_customer_gets_cheap_exp' => 'wbte_sc_bogo_customer_gets_cheapest',
            'wbte_sc_bogo_customer_gets_discount_type' => 'wbte_sc_bogo_customer_gets_free',
            'wbte_sc_bogo_customer_gets_qty' => 1,
            'wbte_sc_bogo_apply_offer' => 'wbte_sc_bogo_apply_custom',
            'wbte_sc_bogo_apply_custom_min' => '3,5',
            'wbte_sc_bogo_apply_custom_max' => '4,0',
            'wbte_sc_bogo_apply_custom_times' => '1,2',
        ]);

        $this->assertSame('custom', $p['bogo']['apply']);
        $this->assertCount(2, $p['bogo']['custom']);
        $this->assertSame(5.0, $p['bogo']['custom'][1]['min']);
        $this->assertSame(2, $p['bogo']['custom'][1]['times']);
    }

    public function testFromFreeGiftToRule(): void
    {
        $p = PromotionMapper::fromFreeGift(['source_id' => 0, 'threshold' => 100, 'label' => 'Free gift']);
        $rule = PromotionMapper::toRule($p);

        $this->assertSame(Rule::TYPE_FREE_GIFT, $rule->type);
        $this->assertSame(100.0, $rule->gift['threshold']);
    }

    public function testToRulePreservesScopeAndExclusivity(): void
    {
        $p = PromotionMapper::fromWebToffeeAuto([
            'source_id' => 1, 'code' => 'x', 'discount_type' => 'percent', 'amount' => 10,
            'exclusive' => true, 'scope_products' => [5, 6], 'exclude_products' => [7],
        ]);
        $rule = PromotionMapper::toRule($p);

        $this->assertSame(Rule::EXCL_EXCLUSIVE, $rule->exclusivity);
        $this->assertSame([5, 6], $rule->scopeProducts);
        $this->assertSame([7], $rule->excludeProducts);
    }
}
