import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
import { fetchCartFromStore } from '@/lib/store-api';
import { recordWidgetSource } from '@/lib/widgetAttribution';
import { getBrowserClient } from '@/lib/apollo-client';
import { GET_GIFT_PRODUCTS } from '@/graphql/queries/products';
import { useCartOffers } from '@/config/cartOffers';
import styles from './FreeGiftWidget.module.css';

function parsePrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

interface GiftProduct {
  databaseId: number;
  name: string;
  slug: string;
  price: string;
  image?: { sourceUrl: string; altText?: string };
}

interface Props {
  subtotal: number;
}

const GIFT_STORAGE_KEY = 'mf_gift_product_id';

// Bounded backstop: how many times to try attaching the gift coupon for a given
// cart composition before giving up and removing the orphaned gift item. Keeps a
// coupon that can't attach from spinning apply-coupon forever.
const MAX_REAPPLY = 3;

function readStoredGiftId(): number | null {
  if (typeof window === 'undefined') return null;
  try { return parseInt(sessionStorage.getItem(GIFT_STORAGE_KEY) || '', 10) || null; } catch { return null; }
}

function writeStoredGiftId(id: number | null) {
  try {
    if (id) sessionStorage.setItem(GIFT_STORAGE_KEY, String(id));
    else sessionStorage.removeItem(GIFT_STORAGE_KEY);
  } catch {}
}

export default function FreeGiftWidget({ subtotal }: Props) {
  const { cart, addToCart, applyCoupon, removeCoupon, removeFromCart, isMutating } = useCart();
  const { freeGift } = useCartOffers();
  const [gifts, setGifts] = useState<GiftProduct[]>([]);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const reapplyingRef = useRef(false);
  const attemptSigRef = useRef<string>('');
  const attemptCountRef = useRef(0);
  const gaveUpSigRef = useRef<string>('');
  const giftIdRef = useRef<number | null>(readStoredGiftId());

  // Compute qualifying subtotal excluding the free gift item — the gift's own
  // price must not count toward the threshold that keeps the gift active.
  const qualifyingSubtotal = useMemo(() => {
    if (!cart) return subtotal;
    const trackedId = giftIdRef.current;
    const giftCoupon = cart.appliedCoupons?.find((c) => c.code.startsWith('mf-free-gift-'));
    const giftProductId = trackedId || (giftCoupon ? parseInt(giftCoupon.code.replace('mf-free-gift-', ''), 10) : null);
    if (!giftProductId) return subtotal;
    const giftItem = cart.items.find((i) => i.product.databaseId === giftProductId);
    if (!giftItem) return subtotal;
    return subtotal - parsePrice(giftItem.subtotal || giftItem.product.price);
  }, [cart, subtotal]);

  const unlocked = freeGift.enabled && qualifyingSubtotal >= freeGift.threshold;

  // Remove the gift item and coupon when cart drops below the threshold.
  // Uses both the coupon code AND the tracked gift ID so orphaned gifts
  // (coupon auto-removed by WooCommerce) are still cleaned up.
  useEffect(() => {
    if (unlocked || removing || isMutating || addingId !== null || !freeGift.enabled || !cart) return;
    const giftCoupon = cart.appliedCoupons?.find((c) => c.code.startsWith('mf-free-gift-'));
    const couponProductId = giftCoupon ? parseInt(giftCoupon.code.replace('mf-free-gift-', ''), 10) : null;
    const trackedId = giftIdRef.current;
    const giftProductId = couponProductId || trackedId;
    const giftItem = giftProductId
      ? cart.items.find((i) => i.product.databaseId === giftProductId)
      : null;
    if (!giftCoupon && !giftItem) return;
    setRemoving(true);
    (async () => {
      try {
        if (giftItem) {
          try { await removeFromCart(giftItem.key); } catch {}
        }
        if (giftCoupon) {
          try { await removeCoupon(giftCoupon.code); } catch {}
        }
        giftIdRef.current = null;
        writeStoredGiftId(null);
      } finally {
        setRemoving(false);
      }
    })();
  }, [unlocked, removing, isMutating, addingId, freeGift.enabled, cart, removeFromCart, removeCoupon]);

  useEffect(() => {
    if (!unlocked || gifts.length > 0) return;
    let cancelled = false;

    const fetchGifts = async () => {
      const variables: Record<string, unknown> = { maxPrice: freeGift.maxGiftPrice, first: 8 };

      if (freeGift.collections && freeGift.collections.length > 0) {
        try {
          const res = await fetch(`/api/shop/gift-product-ids?collections=${freeGift.collections.join(',')}`);
          const data = await res.json();
          if (cancelled) return;
          if (Array.isArray(data?.ids) && data.ids.length > 0) {
            variables.include = data.ids;
          } else {
            return;
          }
        } catch {
          return;
        }
      }

      const { data } = await getBrowserClient().query({
        query: GET_GIFT_PRODUCTS,
        variables,
        fetchPolicy: 'cache-first',
      });
      if (cancelled) return;
      const nodes = (data?.products?.nodes || []).filter((n: GiftProduct) => n?.databaseId);
      setGifts(nodes);
    };

    fetchGifts().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [unlocked, gifts.length, freeGift.maxGiftPrice, freeGift.collections]);

  const pickGift = useCallback(
    async (gift: GiftProduct) => {
      setAddingId(gift.databaseId);
      try {
        const res = await fetch('/api/shop/free-gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: gift.databaseId }),
        });
        const data = await res.json();
        // No coupon code back (not eligible / error) — don't add a full-price
        // "gift" the customer would be charged for.
        if (!data?.code) return;

        recordWidgetSource(gift.databaseId, 'free_gift');
        giftIdRef.current = gift.databaseId;
        writeStoredGiftId(gift.databaseId);
        await addToCart({ productId: gift.databaseId, quantity: 1 });
        await applyCoupon(data.code);

        // Verify the coupon actually attached — applyCoupon reports success
        // whenever the request doesn't throw, even if WooCommerce silently
        // dropped the coupon. Check the real cart state and roll back the item
        // if the discount isn't there, so we never leave an unpaid-for gift.
        const freshCart = await fetchCartFromStore();
        const applied = freshCart?.appliedCoupons?.some((c) => c.code === data.code);
        if (!applied) {
          const addedItem = freshCart?.items.find((i) => i.product.databaseId === gift.databaseId);
          if (addedItem) {
            try { await removeFromCart(addedItem.key); } catch {}
          }
          giftIdRef.current = null;
          writeStoredGiftId(null);
        }
      } finally {
        setAddingId(null);
      }
    },
    [addToCart, applyCoupon, removeFromCart]
  );

  // Backstop: re-attach the gift coupon when the gift product is in the cart
  // above threshold but its coupon isn't applied (added in a prior render, or a
  // later mutation dropped the coupon). Bounded per cart composition:
  //  - Attempts are counted UP FRONT, not from applyCoupon's return value, which
  //    reports success whenever the request doesn't throw even if WooCommerce
  //    silently dropped the coupon — the old source of a 40x apply-coupon storm.
  //  - Success is detected by observing the coupon actually present on the cart,
  //    which resets the budget.
  //  - The budget resets only when the cart composition genuinely changes (a
  //    stable signature), so refetch churn can't keep clearing it.
  //  - When the budget is exhausted and the coupon still won't attach, the
  //    orphaned gift item is removed once so it's never billed at full price.
  useEffect(() => {
    if (!unlocked || !cart || isMutating || removing || reapplyingRef.current) return;
    if (gifts.length === 0) return;
    const giftIds = new Set(gifts.map((g) => g.databaseId));
    const giftInCart = cart.items.find((i) => giftIds.has(i.product.databaseId));
    if (!giftInCart) return;

    const couponCode = `mf-free-gift-${giftInCart.product.databaseId}`;
    const hasCoupon = cart.appliedCoupons?.some((c) => c.code === couponCode);

    const sig = cart.items
      .map((i) => `${i.product.databaseId}:${i.quantity}`)
      .sort()
      .join('|');

    if (hasCoupon) {
      attemptSigRef.current = sig;
      attemptCountRef.current = 0;
      return;
    }

    if (sig !== attemptSigRef.current) {
      attemptSigRef.current = sig;
      attemptCountRef.current = 0;
    }

    if (attemptCountRef.current >= MAX_REAPPLY) {
      // Give up: remove the orphaned gift item once for this cart composition so
      // the customer isn't charged full price for a gift that never got its
      // discount. The server-side reason is captured by the forensics logger.
      if (gaveUpSigRef.current !== sig) {
        gaveUpSigRef.current = sig;
        reapplyingRef.current = true;
        (async () => {
          try {
            await removeFromCart(giftInCart.key);
            giftIdRef.current = null;
            writeStoredGiftId(null);
          } catch {}
          reapplyingRef.current = false;
        })();
      }
      return;
    }

    attemptCountRef.current++;
    reapplyingRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/shop/free-gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: giftInCart.product.databaseId }),
        });
        const data = await res.json();
        if (data?.code) {
          await applyCoupon(data.code);
          giftIdRef.current = giftInCart.product.databaseId;
          writeStoredGiftId(giftInCart.product.databaseId);
        }
      } catch {
        // attempt already counted; success is confirmed on the next run via hasCoupon
      }
      reapplyingRef.current = false;
    })();
  }, [unlocked, cart, isMutating, removing, gifts, applyCoupon, removeFromCart]);

  if (!unlocked || gifts.length === 0) return null;

  const giftIds = new Set(gifts.map((g) => g.databaseId));
  const giftInCart = cart?.items.find((i) => giftIds.has(i.product.databaseId));
  const giftCouponApplied = giftInCart && cart?.appliedCoupons?.some(
    (c) => c.code === `mf-free-gift-${giftInCart.product.databaseId}`
  );

  if (giftInCart && giftCouponApplied) {
    return (
      <div className={styles.widget}>
        <p className={styles.headingDone}>
          Free gift added: <strong>{giftInCart.product.name}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <p className={styles.heading}>You unlocked a free gift. Pick one:</p>
      <div className={styles.grid}>
        {gifts.map((gift) => (
          <button
            key={gift.databaseId}
            type="button"
            className={styles.gift}
            onClick={() => pickGift(gift)}
            disabled={isMutating || addingId !== null}
          >
            <span className={styles.giftImage}>
              {gift.image?.sourceUrl ? (
                <Image
                  src={gift.image.sourceUrl}
                  alt={gift.image.altText || gift.name}
                  width={64}
                  height={64}
                  className={styles.img}
                />
              ) : null}
            </span>
            <span className={styles.giftName}>{gift.name}</span>
            <span className={styles.giftAdd}>{addingId === gift.databaseId ? 'Adding...' : 'Add free'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}