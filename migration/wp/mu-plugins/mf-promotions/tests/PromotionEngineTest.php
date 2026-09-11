<?php

declare(strict_types=1);

namespace MellowFellow\Promotions\Tests;

use MellowFellow\Promotions\Line;
use MellowFellow\Promotions\PromotionEngine;
use MellowFellow\Promotions\Rule;
use PHPUnit\Framework\TestCase;

final class PromotionEngineTest extends TestCase
{
    private PromotionEngine $engine;

    protected function setUp(): void
    {
        $this->engine = new PromotionEngine(2);
    }

    /** @param array<int,array> $lines */
    private function lines(array $lines): array
    {
        return array_map([Line::class, 'fromArray'], $lines);
    }

    private function rule(array $r): Rule
    {
        return Rule::fromArray($r);
    }

    // ---------------------------------------------------------------- auto %

    public function testAutoPercentDiscountsEligibleLinesOnly(): void
    {
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 19.99, 'qty' => 1, 'category_ids' => [3286]], // edible
            ['key' => 'b', 'product_id' => 2, 'price' => 44.99, 'qty' => 1, 'category_ids' => [999]],   // other
        ]);
        $rule = $this->rule([
            'id' => 'auto20', 'type' => 'auto_percent', 'amount' => 20, 'scope_categories' => [3286, 3287],
        ]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(4.00, $r->discountForLine('a')); // 20% of 19.99 = 3.998 -> 4.00
        $this->assertSame(0.0, $r->discountForLine('b'));
        $this->assertCount(1, $r->applied);
    }

    public function testAutoPercentBaseIsWhateverPriceWasPassed(): void
    {
        // The adapter passes the sale price as `price`; the engine just uses it.
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 10.00, 'qty' => 2]]);
        $rule = $this->rule(['id' => 'p', 'type' => 'auto_percent', 'amount' => 50]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(10.00, $r->discountForLine('a')); // 50% of 10 * 2 units
    }

    public function testIdempotentAcrossRepeatedResolves(): void
    {
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 19.99, 'qty' => 1]]);
        $rule = $this->rule(['id' => 'p', 'type' => 'auto_percent', 'amount' => 20]);

        $r1 = $this->engine->resolve($lines, [$rule]);
        $r2 = $this->engine->resolve($lines, [$rule]);
        $r3 = $this->engine->resolve($lines, [$rule]);

        $this->assertSame($r1->lineDiscounts, $r2->lineDiscounts);
        $this->assertSame($r2->lineDiscounts, $r3->lineDiscounts);
    }

    // ------------------------------------------------------------ fixed types

    public function testAutoFixedProductCapsAtUnitPrice(): void
    {
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 5.00, 'qty' => 3],
        ]);
        $rule = $this->rule(['id' => 'f', 'type' => 'auto_fixed_product', 'amount' => 8]); // > unit price

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(15.00, $r->discountForLine('a')); // capped to 5 each * 3
    }

    public function testAutoFixedCartDistributesProportionallyAndCaps(): void
    {
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 30.00, 'qty' => 1],
            ['key' => 'b', 'product_id' => 2, 'price' => 10.00, 'qty' => 1],
        ]);
        $rule = $this->rule(['id' => 'c', 'type' => 'auto_fixed_cart', 'amount' => 20]);

        $r = $this->engine->resolve($lines, [$rule]);

        // pool 40 -> a gets 20*(30/40)=15, b gets 20*(10/40)=5
        $this->assertSame(15.00, $r->discountForLine('a'));
        $this->assertSame(5.00, $r->discountForLine('b'));
        $this->assertSame(20.00, $r->totalDiscount());
    }

    // -------------------------------------------------------------------- BOGO

    public function testBogoCheapestRepeatFree(): void
    {
        // hercbogo: buy 2, cheapest free, repeat.
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 44.99, 'qty' => 1],
            ['key' => 'b', 'product_id' => 2, 'price' => 19.99, 'qty' => 1],
            ['key' => 'c', 'product_id' => 3, 'price' => 19.99, 'qty' => 1],
        ]);
        $rule = $this->rule([
            'id' => 'herc', 'type' => 'bogo',
            'bogo' => ['select' => 'cheapest', 'discount_type' => 'free', 'gets_qty' => 1,
                       'apply' => 'repeatedly', 'triggers' => 'qty', 'min_qty' => 2],
        ]);

        $r = $this->engine->resolve($lines, [$rule]);

        // 3 units -> floor(3/2)=1 free of the cheapest (19.99)
        $this->assertSame(19.99, $r->totalDiscount());
    }

    public function testBogoCheapestRepeatTwice(): void
    {
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 19.99, 'qty' => 4]]);
        $rule = $this->rule([
            'id' => 'herc', 'type' => 'bogo',
            'bogo' => ['select' => 'cheapest', 'discount_type' => 'free', 'gets_qty' => 1,
                       'apply' => 'repeatedly', 'triggers' => 'qty', 'min_qty' => 2],
        ]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(39.98, $r->totalDiscount()); // 4 units -> 2 free
    }

    public function testBogoExpensivePercent(): void
    {
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 50.00, 'qty' => 1],
            ['key' => 'b', 'product_id' => 2, 'price' => 10.00, 'qty' => 1],
        ]);
        $rule = $this->rule([
            'id' => 'x', 'type' => 'bogo',
            'bogo' => ['select' => 'expensive', 'discount_type' => 'perc', 'perc' => 50, 'gets_qty' => 1,
                       'apply' => 'repeatedly', 'triggers' => 'qty', 'min_qty' => 2],
        ]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(25.00, $r->discountForLine('a')); // 50% off the most expensive
        $this->assertSame(0.0, $r->discountForLine('b'));
    }

    public function testBogoFinalPriceAndFixedOff(): void
    {
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 30.00, 'qty' => 2]]);

        $final = $this->rule(['id' => 'f', 'type' => 'bogo',
            'bogo' => ['select' => 'cheapest', 'discount_type' => 'final', 'final' => 10, 'gets_qty' => 1,
                       'apply' => 'once']]);
        $this->assertSame(20.00, $this->engine->resolve($lines, [$final])->totalDiscount()); // 30 -> 10

        $fixed = $this->rule(['id' => 'g', 'type' => 'bogo',
            'bogo' => ['select' => 'cheapest', 'discount_type' => 'price', 'price' => 12, 'gets_qty' => 1,
                       'apply' => 'once']]);
        $this->assertSame(12.00, $this->engine->resolve($lines, [$fixed])->totalDiscount()); // $12 off one unit
    }

    public function testBogoSameProduct(): void
    {
        // Buy 2 get 1 of the SAME product free; qty 6 -> 3 free.
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 10.00, 'qty' => 6]]);
        $rule = $this->rule(['id' => 's', 'type' => 'bogo',
            'bogo' => ['select' => 'same', 'discount_type' => 'free', 'gets_qty' => 1,
                       'apply' => 'repeatedly', 'triggers' => 'qty', 'min_qty' => 2]]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(30.00, $r->totalDiscount()); // 3 free * 10
    }

    public function testBogoCustomRanges(): void
    {
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 10.00, 'qty' => 5]]);
        $rule = $this->rule(['id' => 'c', 'type' => 'bogo',
            'bogo' => ['select' => 'cheapest', 'discount_type' => 'free', 'gets_qty' => 1, 'apply' => 'custom',
                       'triggers' => 'qty',
                       'custom' => [['min' => 3, 'max' => 4, 'times' => 1], ['min' => 5, 'max' => 0, 'times' => 2]]]]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(20.00, $r->totalDiscount()); // qty 5 -> last open range -> 2 free
    }

    // ------------------------------------------------------------- free gift

    public function testFreeGiftZeroedAboveThreshold(): void
    {
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 120.00, 'qty' => 1],
            ['key' => 'g', 'product_id' => 9, 'price' => 19.99, 'qty' => 1, 'is_gift' => true],
        ]);
        $rule = $this->rule(['id' => 'gift', 'type' => 'free_gift', 'gift' => ['threshold' => 100]]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(19.99, $r->discountForLine('g'));
    }

    public function testFreeGiftThresholdUsesPreDiscountSubtotalExcludingGift(): void
    {
        // Cart just over $100 pre-discount; a 20% auto rule would drop it under $100.
        // Gift must still qualify because the threshold is pre-discount and excludes the gift.
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 105.00, 'qty' => 1, 'category_ids' => [3286]],
            ['key' => 'g', 'product_id' => 9, 'price' => 19.99, 'qty' => 1, 'is_gift' => true],
        ]);
        $auto = $this->rule(['id' => 'p', 'type' => 'auto_percent', 'amount' => 20, 'priority' => 10,
                             'scope_categories' => [3286]]);
        $gift = $this->rule(['id' => 'gift', 'type' => 'free_gift', 'priority' => 20, 'gift' => ['threshold' => 100]]);

        $r = $this->engine->resolve($lines, [$auto, $gift]);

        $this->assertSame(21.00, $r->discountForLine('a')); // 20% of 105
        $this->assertSame(19.99, $r->discountForLine('g')); // gift still free
    }

    // ------------------------------------------------------------ protection

    public function testBundleAndGiftLinesNeverTouchedByAutoOrBogo(): void
    {
        $lines = $this->lines([
            ['key' => 'a', 'product_id' => 1, 'price' => 10.00, 'qty' => 1],                      // normal, cheapest
            ['key' => 'g', 'product_id' => 9, 'price' => 5.00, 'qty' => 1, 'is_gift' => true],    // gift (cheaper)
            ['key' => 'z', 'product_id' => 8, 'price' => 3.00, 'qty' => 1, 'is_bundle' => true],  // bundle (cheapest)
        ]);
        $auto = $this->rule(['id' => 'p', 'type' => 'auto_percent', 'amount' => 50]);
        $bogo = $this->rule(['id' => 'b', 'type' => 'bogo',
            'bogo' => ['select' => 'cheapest', 'discount_type' => 'free', 'gets_qty' => 1, 'apply' => 'once']]);

        $r = $this->engine->resolve($lines, [$auto, $bogo]);

        $this->assertSame(0.0, $r->discountForLine('g')); // gift untouched by auto/bogo
        $this->assertSame(0.0, $r->discountForLine('z')); // bundle untouched
        // BOGO's free unit must be the normal line 'a' (not the cheaper gift/bundle).
        $this->assertGreaterThan(0.0, $r->discountForLine('a'));
    }

    // -------------------------------------------------- stacking / exclusivity

    public function testExclusiveRuleBlocksLowerPriorityRuleOnSameLine(): void
    {
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 100.00, 'qty' => 1]]);
        $first = $this->rule(['id' => 'first', 'type' => 'auto_percent', 'amount' => 10,
                              'priority' => 1, 'exclusivity' => 'exclusive']);
        $second = $this->rule(['id' => 'second', 'type' => 'auto_percent', 'amount' => 50, 'priority' => 2]);

        $r = $this->engine->resolve($lines, [$second, $first]); // order shouldn't matter; priority does

        $this->assertSame(10.00, $r->discountForLine('a')); // only the exclusive first rule applied
        $this->assertCount(1, $r->applied);
    }

    public function testUniversalRulesStackButNeverBelowZero(): void
    {
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 100.00, 'qty' => 1]]);
        $r = $this->engine->resolve($lines, [
            $this->rule(['id' => 'x', 'type' => 'auto_percent', 'amount' => 70, 'priority' => 1]),
            $this->rule(['id' => 'y', 'type' => 'auto_percent', 'amount' => 70, 'priority' => 2]),
        ]);

        $this->assertSame(100.00, $r->discountForLine('a')); // capped at line total, never negative
    }

    public function testMinSubtotalConditionGatesRule(): void
    {
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 50.00, 'qty' => 1]]);
        $rule = $this->rule(['id' => 'p', 'type' => 'auto_percent', 'amount' => 20, 'min_subtotal' => 100]);

        $r = $this->engine->resolve($lines, [$rule]);

        $this->assertSame(0.0, $r->totalDiscount()); // below min subtotal -> not applied
    }

    public function testEmptyRulesAndEmptyCart(): void
    {
        $this->assertSame(0.0, $this->engine->resolve([], [])->totalDiscount());
        $lines = $this->lines([['key' => 'a', 'product_id' => 1, 'price' => 10.00, 'qty' => 1]]);
        $this->assertSame(0.0, $this->engine->resolve($lines, [])->totalDiscount());
    }
}
