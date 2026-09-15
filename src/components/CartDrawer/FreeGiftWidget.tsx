import { useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
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

// The free gift is a server-managed $0 cart line, not a coupon (see
// mellow-fellow-free-gift.php). The server is authoritative: it prices the gift
// to $0 while the cart qualifies and removes it otherwise. That makes this
// widget purely presentational — pick a gift, and read the gift's presence
// straight off the cart (item.isFreeGift). No coupon apply/verify/reapply
// bookkeeping, which is what used to fight WebToffee's auto-apply coupons.
export default function FreeGiftWidget({ subtotal }: Props) {
  const { cart, addFreeGift, removeFreeGift, isMutating } = useCart();
  const { freeGift } = useCartOffers();
  const [gifts, setGifts] = useState<GiftProduct[]>([]);
  const [addingId, setAddingId] = useState<number | null>(null);

  // Pre-discount subtotal of all NON-gift lines — mirrors the server's
  // qualifying-subtotal calc (regular price x qty, gift line excluded) so the
  // widget unlocks at exactly the point the server will accept the gift.
  const qualifyingSubtotal = useMemo(() => {
    if (!cart) return subtotal;
    return cart.items.reduce((sum, i) => {
      if (i.isFreeGift) return sum;
      const unit = parsePrice(i.product.regularPrice || i.product.price);
      return sum + unit * i.quantity;
    }, 0);
  }, [cart, subtotal]);

  const unlocked = freeGift.enabled && qualifyingSubtotal >= freeGift.threshold;
  const giftInCart = cart?.items.find((i) => i.isFreeGift) || null;

  // Load the gift options once the cart unlocks and no gift is chosen yet.
  useEffect(() => {
    if (!unlocked || giftInCart || gifts.length > 0) return;
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
  }, [unlocked, giftInCart, gifts.length, freeGift.maxGiftPrice, freeGift.collections]);

  // If the cart drops below the threshold while a gift is in it, drop the gift.
  // The server enforces this on its own (on the next cart load), but doing it
  // here keeps the UI from briefly showing a gift the cart no longer qualifies
  // for. No-ops when there's no gift line.
  useEffect(() => {
    if (!freeGift.enabled || isMutating) return;
    if (!unlocked && giftInCart) {
      removeFreeGift().catch(() => {});
    }
  }, [unlocked, giftInCart, isMutating, freeGift.enabled, removeFreeGift]);

  const pickGift = useCallback(
    async (gift: GiftProduct) => {
      setAddingId(gift.databaseId);
      try {
        recordWidgetSource(gift.databaseId, 'free_gift');
        await addFreeGift(gift.databaseId);
      } catch {
        // addFreeGift surfaces the error via cart context; nothing to add here.
      } finally {
        setAddingId(null);
      }
    },
    [addFreeGift]
  );

  if (giftInCart) {
    return (
      <div className={styles.widget}>
        <p className={styles.headingDone}>
          Free gift added: <strong>{giftInCart.product.name}</strong>
        </p>
      </div>
    );
  }

  if (!unlocked || gifts.length === 0) return null;

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
