import { useState, useEffect } from 'react';

export interface OfferTier {
  amount: number;
  label: string;
}

export interface FreeGiftConfig {
  enabled: boolean;
  threshold: number;
  mode: 'automatic' | 'select';
  maxGiftPrice: number;
}

export interface CartOffers {
  freeShippingThreshold: number;
  freeGift: FreeGiftConfig;
  tiers: OfferTier[];
}

export const DEFAULT_OFFERS: CartOffers = {
  freeShippingThreshold: 80,
  freeGift: { enabled: false, threshold: 100, mode: 'select', maxGiftPrice: 10 },
  tiers: [{ amount: 80, label: 'Free Shipping' }],
};

let cached: CartOffers | null = null;

export function useCartOffers(): CartOffers {
  const [offers, setOffers] = useState<CartOffers>(cached || DEFAULT_OFFERS);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetch('/api/shop/cart-offers')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data || typeof data.freeShippingThreshold !== 'number') return;
        cached = data;
        setOffers(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return offers;
}
