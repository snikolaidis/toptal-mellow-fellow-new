<?php

declare(strict_types=1);

namespace MellowFellow\Promotions;

/**
 * The engine's output: total discount per line key, and the list of promotions that
 * actually adjusted something (for the cart's locked chips).
 */
final class Result
{
    /**
     * @param array<string,float> $lineDiscounts key => total discount across the whole line
     * @param array<int,array{id:string,label:string,amount:float}> $applied
     */
    public function __construct(
        public readonly array $lineDiscounts,
        public readonly array $applied,
    ) {
    }

    public function discountForLine(string $key): float
    {
        return $this->lineDiscounts[$key] ?? 0.0;
    }

    public function totalDiscount(): float
    {
        return array_sum($this->lineDiscounts);
    }
}
