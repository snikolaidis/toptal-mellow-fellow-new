<?php

declare(strict_types=1);

namespace MellowFellow\Promotions;

/**
 * Deterministic, idempotent promotion resolver — the heart of the system, with ZERO
 * framework dependencies so it can be unit-tested exhaustively and fast.
 *
 * Given the cart lines and the active rules, it returns the total discount per line and
 * the promotions that applied. Running it once or many times on the same input yields the
 * identical result — which is why, in WooCommerce, applying the output as line prices never
 * fights the Store API's coupon re-validation.
 */
final class PromotionEngine
{
    private int $scale;

    public function __construct(int $priceDecimals = 2)
    {
        $this->scale = max(0, $priceDecimals);
    }

    /**
     * @param Line[] $lines
     * @param Rule[] $rules
     */
    public function resolve(array $lines, array $rules): Result
    {
        // Stable ordering: priority asc, then id, so ties are deterministic.
        usort($rules, static function (Rule $a, Rule $b): int {
            return [$a->priority, $a->id] <=> [$b->priority, $b->id];
        });

        $discount = [];       // key => running discount total
        $claimed  = [];       // key => true when an exclusive rule owns the line
        $applied  = [];

        foreach ($lines as $line) {
            $discount[$line->key] = 0.0;
        }

        $subtotalAll = 0.0;         // pre-discount subtotal, all non-gift lines
        foreach ($lines as $line) {
            if (!$line->isGift) {
                $subtotalAll += $line->lineTotal();
            }
        }

        foreach ($rules as $rule) {
            $saved = 0.0;

            // Rule-level conditions (evaluated against pre-discount values).
            if ($rule->minSubtotal !== null && $subtotalAll < $rule->minSubtotal) {
                continue;
            }
            if ($rule->minQty !== null && $this->scopeQty($lines, $rule) < $rule->minQty) {
                continue;
            }

            switch ($rule->type) {
                case Rule::TYPE_AUTO_PERCENT:
                case Rule::TYPE_AUTO_FIXED_PRODUCT:
                    $saved = $this->applyPerLine($lines, $rule, $discount, $claimed);
                    break;
                case Rule::TYPE_AUTO_FIXED_CART:
                    $saved = $this->applyFixedCart($lines, $rule, $discount, $claimed);
                    break;
                case Rule::TYPE_BOGO:
                    $saved = $this->applyBogo($lines, $rule, $discount, $claimed);
                    break;
                case Rule::TYPE_FREE_GIFT:
                    $saved = $this->applyFreeGift($lines, $rule, $discount, $subtotalAll);
                    break;
            }

            if ($saved > 0) {
                $applied[] = [
                    'id'     => $rule->id,
                    'label'  => $rule->label,
                    'amount' => $this->round($saved),
                ];
            }
        }

        // Round line discounts and hard-cap at the line total (never negative price).
        foreach ($discount as $key => $amt) {
            $discount[$key] = $this->round($amt);
        }

        return new Result($discount, $applied);
    }

    /** Total quantity of scope-matching, unprotected lines (for min-qty conditions). */
    private function scopeQty(array $lines, Rule $rule): int
    {
        $qty = 0;
        foreach ($lines as $line) {
            if (!$line->isProtectedFromDiscounts() && $rule->matches($line)) {
                $qty += $line->qty;
            }
        }
        return $qty;
    }

    private function remaining(Line $line, array $discount): float
    {
        return $line->lineTotal() - ($discount[$line->key] ?? 0.0);
    }

    private function addDiscount(Line $line, float $add, array &$discount): float
    {
        $rem = $this->remaining($line, $discount);
        $applied = max(0.0, min($add, $rem)); // never below zero
        $discount[$line->key] += $applied;
        return $applied;
    }

    /** auto_percent / auto_fixed_product — per-unit cut on each eligible line. */
    private function applyPerLine(array $lines, Rule $rule, array &$discount, array &$claimed): float
    {
        $saved = 0.0;
        foreach ($lines as $line) {
            if (!empty($claimed[$line->key]) || $line->isProtectedFromDiscounts() || !$rule->matches($line) || $line->price <= 0) {
                continue;
            }
            $perUnit = $rule->type === Rule::TYPE_AUTO_FIXED_PRODUCT
                ? min($line->price, $rule->amount)
                : $line->price * ($rule->amount / 100);
            $saved += $this->addDiscount($line, $perUnit * $line->qty, $discount);
            if ($rule->exclusivity === Rule::EXCL_EXCLUSIVE) {
                $claimed[$line->key] = true;
            }
        }
        return $saved;
    }

    /** auto_fixed_cart — spread a whole-cart amount across eligible lines by value. */
    private function applyFixedCart(array $lines, Rule $rule, array &$discount, array &$claimed): float
    {
        $pool = 0.0;
        $eligible = [];
        foreach ($lines as $line) {
            if (!empty($claimed[$line->key]) || $line->isProtectedFromDiscounts() || !$rule->matches($line)) {
                continue;
            }
            $rem = $this->remaining($line, $discount);
            if ($rem > 0) {
                $eligible[] = [$line, $rem];
                $pool += $rem;
            }
        }
        if ($pool <= 0) {
            return 0.0;
        }
        $amount = min($rule->amount, $pool);
        $saved = 0.0;
        foreach ($eligible as [$line, $rem]) {
            $saved += $this->addDiscount($line, $amount * ($rem / $pool), $discount);
        }
        return $saved;
    }

    /** free_gift — zero the gift line(s) when the pre-discount (ex-gift) subtotal qualifies. */
    private function applyFreeGift(array $lines, Rule $rule, array &$discount, float $subtotalExGift): float
    {
        $threshold = (float) ($rule->gift['threshold'] ?? 0);
        if ($subtotalExGift < $threshold) {
            return 0.0;
        }
        $saved = 0.0;
        foreach ($lines as $line) {
            if ($line->isGift) {
                $saved += $this->addDiscount($line, $line->lineTotal(), $discount);
            }
        }
        return $saved;
    }

    /** BOGO — cheapest / expensive / same-product, all discount types & frequencies. */
    private function applyBogo(array $lines, Rule $rule, array &$discount, array &$claimed): float
    {
        $cfg = $rule->bogo ?? [];
        $select = $cfg['select'] ?? 'cheapest';

        if ($select === 'same') {
            return $this->applyBogoSameProduct($lines, $rule, $discount, $claimed);
        }

        // Build the eligible unit pool.
        $units = [];       // list of ['line'=>Line,'price'=>float]
        $eligibleUnits = 0;
        $eligibleAmount = 0.0;
        foreach ($lines as $line) {
            if (!empty($claimed[$line->key]) || $line->isProtectedFromDiscounts() || !$rule->matches($line) || $line->price <= 0) {
                continue;
            }
            for ($i = 0; $i < $line->qty; $i++) {
                $units[] = ['line' => $line, 'price' => $line->price];
            }
            $eligibleUnits += $line->qty;
            $eligibleAmount += $line->lineTotal();
        }
        if (!$units) {
            return 0.0;
        }

        usort($units, static function (array $a, array $b) use ($select): int {
            return $select === 'expensive' ? ($b['price'] <=> $a['price']) : ($a['price'] <=> $b['price']);
        });

        $give = $this->bogoGiveawayUnits($cfg, $eligibleUnits, $eligibleAmount);
        if ($give <= 0) {
            return 0.0;
        }

        $saved = 0.0;
        $n = 0;
        foreach ($units as $u) {
            if ($n >= $give) {
                break;
            }
            $cut = $this->bogoUnitDiscount($cfg, $u['price']);
            if ($cut > 0) {
                $saved += $this->addDiscount($u['line'], $cut, $discount);
            }
            $n++;
        }
        return $saved;
    }

    /** Buy X get X of the SAME product: frequency computed per matching line. */
    private function applyBogoSameProduct(array $lines, Rule $rule, array &$discount, array &$claimed): float
    {
        $cfg = $rule->bogo ?? [];
        $saved = 0.0;
        foreach ($lines as $line) {
            if (!empty($claimed[$line->key]) || $line->isProtectedFromDiscounts() || !$rule->matches($line) || $line->price <= 0) {
                continue;
            }
            $give = $this->bogoGiveawayUnits($cfg, $line->qty, $line->lineTotal());
            $give = min($give, $line->qty);
            for ($i = 0; $i < $give; $i++) {
                $saved += $this->addDiscount($line, $this->bogoUnitDiscount($cfg, $line->price), $discount);
            }
        }
        return $saved;
    }

    private function bogoUnitDiscount(array $cfg, float $price): float
    {
        if (($cfg['discount_type'] ?? 'free') === 'final') {
            return max(0.0, $price - (float) ($cfg['final'] ?? 0));
        }
        switch ($cfg['discount_type'] ?? 'free') {
            case 'free':
                return $price;
            case 'perc':
                $perc = max(0.0, min(100.0, (float) ($cfg['perc'] ?? 0)));
                return $price * ($perc / 100);
            case 'price':
                return min($price, (float) ($cfg['price'] ?? 0));
        }
        return 0.0;
    }

    private function bogoGiveawayUnits(array $cfg, int $eligibleUnits, float $eligibleAmount): int
    {
        $getsQty = max(0, (int) ($cfg['gets_qty'] ?? 0));
        $apply = $cfg['apply'] ?? 'once';

        if ($apply === 'once') {
            return $getsQty;
        }
        if ($apply === 'repeatedly') {
            $byAmount = ($cfg['triggers'] ?? 'qty') === 'amount';
            $value = $byAmount ? $eligibleAmount : $eligibleUnits;
            $min = $byAmount ? (float) ($cfg['min_amount'] ?? 0) : (float) ($cfg['min_qty'] ?? 0);
            $min = $min <= 0 ? 1 : $min;
            $freq = max(1, (int) ($value / $min));
            $cap = (int) ($cfg['repeat_times'] ?? 0);
            if ($cap > 0) {
                $freq = min($freq, $cap);
            }
            return $freq * $getsQty;
        }
        if ($apply === 'custom') {
            $byAmount = ($cfg['triggers'] ?? 'qty') === 'amount';
            $value = $byAmount ? $eligibleAmount : $eligibleUnits;
            foreach (($cfg['custom'] ?? []) as $i => $range) {
                $min = (float) ($range['min'] ?? $range[0] ?? 0);
                $max = (float) ($range['max'] ?? $range[1] ?? 0);
                $times = (int) ($range['times'] ?? $range[2] ?? 0);
                $isLast = $i === array_key_last($cfg['custom']);
                if ($isLast && $max == 0.0 && $value >= $min) {
                    return $times;
                }
                if ($value >= $min && ($max == 0.0 || $value <= $max)) {
                    return $times;
                }
            }
            return 0;
        }
        return $getsQty;
    }

    private function round(float $n): float
    {
        return round($n, $this->scale);
    }
}
