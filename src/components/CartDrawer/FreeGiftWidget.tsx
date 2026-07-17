import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
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

// The backend mints one coupon per gift product at this fixed code shape
// (see mellow-fellow-free-gift.php) — reconstructing it lets us remove the
// previous gift's coupon without having to track it separately.
function giftCouponCode(productId: number): string {
  return `mf-free-gift-${productId}`;
}

export default function FreeGiftWidget({ subtotal }: Props) {
  const { cart, addToCart, applyCoupon, removeFromCart, removeCoupon, isMutating } = useCart();
  const { freeGift } = useCartOffers();
  const [gifts, setGifts] = useState<GiftProduct[]>([]);
  const [addingId, setAddingId] = useState<number | null>(null);

  const unlocked = freeGift.enabled && subtotal >= freeGift.threshold;

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

  const giftIds = new Set(gifts.map((g) => g.databaseId));
  const giftInCart = cart?.items.find((i) => giftIds.has(i.product.databaseId));

  const pickGift = useCallback(
    async (gift: GiftProduct) => {
      // Already selected — nothing to do.
      if (giftInCart?.product.databaseId === gift.databaseId) return;
      // An add/swap is already in flight — ignore.
      if (addingId !== null) return;

      setAddingId(gift.databaseId);
      try {
        // Swap out the previously chosen gift first, if any — only one at a time.
        if (giftInCart) {
          await removeFromCart(giftInCart.key);
          await removeCoupon(giftCouponCode(giftInCart.product.databaseId)).catch(() => {});
        }

        const res = await fetch('/api/shop/free-gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: gift.databaseId }),
        });
        const data = await res.json();
        recordWidgetSource(gift.databaseId, 'free_gift');
        await addToCart({ productId: gift.databaseId, quantity: 1 });
        if (data?.code) await applyCoupon(data.code);
      } finally {
        setAddingId(null);
      }
    },
    [addToCart, applyCoupon, removeFromCart, removeCoupon, giftInCart, addingId]
  );

  if (!unlocked || gifts.length === 0) return null;

  return (
    <div className={styles.widget}>
      <p className={styles.heading}>
        {giftInCart ? 'Your free gift:' : 'You unlocked a free gift. Pick one:'}
      </p>
      <div className={styles.grid}>
        {gifts.map((gift) => {
          const isSelected = giftInCart?.product.databaseId === gift.databaseId;
          return (
          <button
            key={gift.databaseId}
            type="button"
            className={`${styles.gift} ${isSelected ? styles.giftSelected : ''}`}
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
            <span className={styles.giftAdd}>
              {addingId === gift.databaseId ? 'Adding...' : isSelected ? 'Selected' : 'Add free'}
            </span>
          </button>
          );
        })}
      </div>
    </div>
  );
}
