import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";
import { useCartOffers } from "@/config/cartOffers";
import { fetchRecommendations } from "@/lib/recsCache";
import type { Product } from "@/types/woocommerce";
import styles from "./FreeShippingUpsell.module.css";

function parsePrice(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/*
 * "Add items to hit free shipping" widget for the checkout shipping
 * step. Fully self-contained (reads the cart itself) so it can just
 * be dropped into MellowCheckout with no props.
 *
 * Reuses pieces that already exist elsewhere rather than introducing
 * anything new data-wise:
 * - useCartOffers() for the $ threshold (same source TieredProgressBar
 *   uses in the cart drawer).
 * - /api/shop/recommendations?context=cart via the same
 *   fetchRecommendations() helper + cache the cart drawer uses - its
 *   existing "impulse add-on" phase already biases picks toward
 *   whatever's priced closest to the remaining gap.
 * - addToCart() from CartContext, same call every other add-to-cart
 *   button in the app uses.
 */
export default function FreeShippingUpsell() {
  const { cart, addToCart } = useCart();
  const { freeShippingThreshold } = useCartOffers();

  const subtotal = parsePrice(cart?.subtotal);
  const gap = Math.max(0, freeShippingThreshold - subtotal);

  const [candidates, setCandidates] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);

  const productIdsKey =
    cart?.items?.map((i) => i.product.databaseId).join(",") || "";

  useEffect(() => {
    if (gap <= 0 || !cart?.items?.length) {
      setCandidates([]);
      return;
    }

    let cancelled = false;

    const productIds = cart.items.map((i) => i.product.databaseId);
    const productSlugs = cart.items.map((i) => i.product.slug);

    fetchRecommendations(productIds, productSlugs, subtotal)
      .then((products) => {
        if (cancelled) return;
        const top = products.slice(0, 3);
        setCandidates(top);
        setSelectedId((current) =>
          top.some((p) => p.databaseId === current)
            ? current
            : top[0]?.databaseId ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap > 0, productIdsKey, subtotal]);

  if (gap <= 0 || candidates.length === 0) {
    return null;
  }

  const selectedProduct =
    candidates.find((p) => p.databaseId === selectedId) || null;
  const selectedPrice = selectedProduct
    ? parsePrice(selectedProduct.salePrice || selectedProduct.price)
    : 0;
  const totalPrice = subtotal + selectedPrice;

  const handleAdd = async () => {
    if (!selectedProduct) return;

    setAdding(true);
    try {
      await addToCart({
        productId: selectedProduct.databaseId,
        quantity: 1,
      });
    } finally {
      setAdding(false);
    }
  };

  const progress = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.gapText}>
          Add <strong>${gap.toFixed(2)}</strong> more to get free shipping!
        </span>

        <span className={styles.toggle}>
          Shop Now
          <span
            className={
              expanded
                ? `${styles.chevron} ${styles.chevronUp}`
                : styles.chevron
            }
          >
            ⌄
          </span>
        </span>
      </button>

      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${progress}%` }} />
      </div>

      {expanded && (
        <>
          <div className={styles.options}>
            {candidates.map((product, index) => (
              <div className={styles.optionSlot} key={product.databaseId}>
                {index > 0 && <span className={styles.plus}>+</span>}

                <label
                  className={
                    selectedId === product.databaseId
                      ? `${styles.option} ${styles.optionSelected}`
                      : styles.option
                  }
                >
                  <input
                    type="radio"
                    name="free-shipping-upsell"
                    checked={selectedId === product.databaseId}
                    onChange={() => setSelectedId(product.databaseId)}
                  />

                  <span className={styles.radioDot} />

                  {product.image?.sourceUrl && (
                    <img
                      src={product.image.sourceUrl}
                      alt={product.image.altText || product.name}
                    />
                  )}

                  <strong className={styles.optionName}>
                    {product.name}
                  </strong>

                  <span className={styles.optionPrice}>
                    {product.salePrice ? (
                      <>
                        <span className={styles.salePrice}>
                          {product.salePrice}
                        </span>{" "}
                        <span className={styles.regularPrice}>
                          {product.regularPrice}
                        </span>
                      </>
                    ) : (
                      product.price
                    )}
                  </span>
                </label>
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            <span className={styles.totalLabel}>TOTAL PRICE</span>
            <strong>${totalPrice.toFixed(2)}</strong>
          </div>

          <button
            type="button"
            className={styles.addButton}
            onClick={handleAdd}
            disabled={!selectedProduct || adding}
          >
            {adding ? "Adding..." : "Add 1 Item"}
          </button>
        </>
      )}
    </div>
  );
}
