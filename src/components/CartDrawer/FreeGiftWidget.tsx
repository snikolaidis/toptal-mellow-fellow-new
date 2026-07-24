import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
import { fetchCartFromStore } from '@/lib/store-api';
import { recordWidgetSource } from '@/lib/widgetAttribution';
import { getBrowserClient } from '@/lib/apollo-client';
import { GET_GIFT_PRODUCTS } from '@/graphql/queries/products';
import { useCartOffers } from '@/config/cartOffers';
import styles from './FreeGiftWidget.module.css';

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
  const giftIdRef = useRef<number | null>(readStoredGiftId());

  const unlocked = freeGift.enabled && subtotal >= freeGift.threshold;

  // Remove the gift item and coupon when cart drops below the threshold.
  // Uses both the coupon code AND the tracked gift ID so orphaned gifts
  // (coupon auto-removed by WooCommerce) are still cleaned up.
  useEffect(() => {
    if (unlocked || removing || isMutating || !freeGift.enabled || !cart) return;
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
        if (giftItem) await removeFromCart(giftItem.key);
        if (giftCoupon) await removeCoupon(giftCoupon.code);
        giftIdRef.current = null;
        writeStoredGiftId(null);
      } catch {
      } finally {
        setRemoving(false);
      }
    })();
  }, [unlocked, removing, isMutating, freeGift.enabled, cart, removeFromCart, removeCoupon]);

  useEffect(() => {
    if (!unlocked || gifts.length > 0) return;
    let cancelled = false;
    getBrowserClient()
      .query({
        query: GET_GIFT_PRODUCTS,
        variables: { maxPrice: freeGift.maxGiftPrice, first: 8 },
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        if (cancelled) return;
        const nodes = (data?.products?.nodes || []).filter((n: GiftProduct) => n?.databaseId);
        setGifts(nodes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [unlocked, gifts.length, freeGift.maxGiftPrice]);

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
        recordWidgetSource(gift.databaseId, 'free_gift');
        giftIdRef.current = gift.databaseId;
        writeStoredGiftId(gift.databaseId);
        await addToCart({ productId: gift.databaseId, quantity: 1 });
        if (data?.code) {
          const couponOk = await applyCoupon(data.code);
          if (!couponOk) {
            const freshCart = await fetchCartFromStore();
            const addedItem = freshCart?.items.find((i) => i.product.databaseId === gift.databaseId);
            if (addedItem) await removeFromCart(addedItem.key);
            giftIdRef.current = null;
            writeStoredGiftId(null);
          }
        }
      } finally {
        setAddingId(null);
      }
    },
    [addToCart, applyCoupon, removeFromCart]
  );

  // Re-apply the coupon when the cart crosses back above the threshold
  // and the gift product is already in the cart from a previous add.
  useEffect(() => {
    if (!unlocked || !cart || isMutating || removing || reapplyingRef.current) return;
    if (gifts.length === 0) return;
    const giftIds = new Set(gifts.map((g) => g.databaseId));
    const giftInCart = cart.items.find((i) => giftIds.has(i.product.databaseId));
    if (!giftInCart) return;
    const couponCode = `mf-free-gift-${giftInCart.product.databaseId}`;
    const hasCoupon = cart.appliedCoupons?.some((c) => c.code === couponCode);
    if (hasCoupon) return;
    reapplyingRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/shop/free-gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: giftInCart.product.databaseId }),
        });
        const data = await res.json();
        if (data?.code) await applyCoupon(data.code);
        giftIdRef.current = giftInCart.product.databaseId;
        writeStoredGiftId(giftInCart.product.databaseId);
      } catch {}
      reapplyingRef.current = false;
    })();
  }, [unlocked, cart, isMutating, removing, gifts, applyCoupon]);

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