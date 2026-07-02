import { useState, ReactNode } from 'react';
import Image from 'next/image';
import { useCart, groupCartItems } from '@/context/CartContext';
import { CloseIcon } from '@/components/icons';
import LoyaltyCheckoutRewards from '@/components/LoyaltyCheckoutRewards';
import styles from './OrderSummary.module.css';

interface CartItem {
  key: string;
  quantity: number;
  total: string;
  bbBundleId?: number;
  bbGroupKey?: string;
  product: {
    name: string;
    price: string;
    image?: {
      sourceUrl: string;
      altText: string;
    };
  };
  variation?: {
    name: string;
    price: string;
  };
}

interface AppliedCoupon {
  code: string;
  discountAmount: string;
}

interface Cart {
  items: CartItem[];
  subtotal: string;
  total: string;
  discountTotal: string;
  shippingTotal: string;
  appliedCoupons?: AppliedCoupon[];
  chosenShippingMethods?: string[];
}

interface OrderSummaryProps {
  cart: Cart;
  subscription?: { savings: number; recurring: number; total: number; label: string };
  subscriptionSlot?: ReactNode;
}

export default function OrderSummary({ cart, subscription, subscriptionSlot }: OrderSummaryProps) {
  const { applyCoupon, removeCoupon, error: cartError, bundleNames, bundleDiscounts, removeBundleGroup } = useCart();
  const { bundles, standalone } = groupCartItems(cart.items as any[], bundleNames);
  const [couponCode, setCouponCode] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const hasDiscount = cart.discountTotal &&
    parseFloat(cart.discountTotal.replace(/[^0-9.-]/g, '')) > 0;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setIsApplying(true);
    setCouponError(null);

    const success = await applyCoupon(couponCode.trim());
    if (success) {
      setCouponCode('');
    } else {
      setCouponError('Invalid coupon code');
    }

    setIsApplying(false);
  };

  const handleRemoveCoupon = async (code: string) => {
    try {
      await removeCoupon(code);
    } catch {
      // Error handled by context
    }
  };

  return (
    <div className={styles.summary}>
      <h2>Order summary</h2>

      {/* Product list */}
      <ul className={styles.items} role="list">
        {/* Bundle groups */}
        {bundles.map((group) => {
          const discount = bundleDiscounts[group.bundleId] ?? 0;
          const allItems = group.instances.flatMap((inst) => inst.items);
          const originalTotal = allItems.reduce(
            (sum, i) => sum + parseFloat(i.total.replace(/[^0-9.]/g, '') || '0'), 0
          );
          const discountedTotal = discount > 0 ? originalTotal * (1 - discount / 100) : originalTotal;

          return (
            <li key={group.bundleId} className={styles.bundleGroup}>
              <div className={styles.bundleGroupHeader}>
                <span className={styles.bundleGroupName}>
                  {group.bundleName}{group.quantity > 1 ? ` ×${group.quantity}` : ''}
                </span>
                <button
                  className={styles.bundleRemoveBtn}
                  onClick={() =>
                    removeBundleGroup(allItems.map((i) => i.key))
                  }
                  aria-label={`Remove ${group.bundleName}`}
                >
                  Remove
                </button>
              </div>
              {group.representativeItems
                .reduce<{ item: typeof group.representativeItems[0]; qty: number; totalAmount: number }[]>(
                  (acc, item) => {
                    const existing = acc.find(
                      (r) => r.item.product.databaseId === item.product.databaseId
                    );
                    const lineTotal = parseFloat(item.total.replace(/[^0-9.]/g, '') || '0');
                    if (existing) {
                      existing.qty += item.quantity;
                      existing.totalAmount += lineTotal;
                    } else {
                      acc.push({ item, qty: item.quantity, totalAmount: lineTotal });
                    }
                    return acc;
                  },
                  []
                )
                .map(({ item, qty, totalAmount }) => {
                  const itemDiscounted = discount > 0
                    ? totalAmount * (1 - discount / 100)
                    : totalAmount;
                  return (
                    <div key={item.product.databaseId} className={styles.bundleItem}>
                      <div className={styles.itemImage}>
                        {item.product.image ? (
                          <Image
                            src={item.product.image.sourceUrl}
                            alt={item.product.image.altText || item.product.name}
                            width={48}
                            height={48}
                            style={{ objectFit: 'contain' }}
                          />
                        ) : (
                          <div className={styles.placeholderImage} />
                        )}
                        <span className={styles.itemQuantity}>{qty}</span>
                      </div>
                      <span className={styles.itemName}>{item.product.name}</span>
                      <div className={styles.bundleItemTotal}>
                        {discount > 0 && (
                          <span className={styles.bundleOriginalPrice}>
                            ${totalAmount.toFixed(2)}
                          </span>
                        )}
                        <span className={styles.itemTotal}>${itemDiscounted.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              <div className={styles.bundleGroupFooter}>
                {discount > 0 && (
                  <span className={styles.bundleOriginalTotal}>
                    ${originalTotal.toFixed(2)}
                  </span>
                )}
                <span className={styles.bundleDiscountedTotal}>
                  ${discountedTotal.toFixed(2)}
                </span>
              </div>
            </li>
          );
        })}

        {/* Standalone items */}
        {standalone.map((item) => (
          <li key={item.key} className={styles.item}>
            <div className={styles.itemImage}>
              {item.product.image ? (
                <Image
                  src={item.product.image.sourceUrl}
                  alt={item.product.image.altText || item.product.name}
                  width={64}
                  height={64}
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div className={styles.placeholderImage} />
              )}
              <span className={styles.itemQuantity}>{item.quantity}</span>
            </div>
            <div className={styles.itemDetails}>
              <h3 className={styles.itemName}>{item.product.name}</h3>
              {item.variation && (
                <p className={styles.itemVariation}>{item.variation.name}</p>
              )}
            </div>
            <span className={styles.itemTotal}>{item.total}</span>
          </li>
        ))}
      </ul>

      {/* Loyalty rewards redemption */}
      <LoyaltyCheckoutRewards />

      {/* Coupon section */}
      <div className={styles.couponSection}>
        <form onSubmit={handleApplyCoupon} className={styles.couponForm}>
          <input
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="Discount code"
            disabled={isApplying}
            className={couponError ? 'error' : ''}
          />
          <button
            type="submit"
            disabled={isApplying || !couponCode.trim()}
            className={styles.couponApplyBtn}
          >
            {isApplying ? 'Applying...' : 'Apply'}
          </button>
        </form>
        {couponError && (
          <p className={styles.couponError}>{couponError}</p>
        )}
        {cartError && (
          <p className={styles.couponError}>{cartError}</p>
        )}

        {/* Applied coupons */}
        {cart.appliedCoupons && cart.appliedCoupons.length > 0 && (
          <div className={styles.appliedCoupons}>
            {cart.appliedCoupons.map((coupon) => (
              <div key={coupon.code} className={styles.appliedCoupon}>
                <span className={styles.couponCode}>{coupon.code}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCoupon(coupon.code)}
                  className={styles.couponRemoveBtn}
                  aria-label={`Remove coupon ${coupon.code}`}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {subscriptionSlot}

      {/* Totals */}
      {(() => {
        const totalBundleDiscount = bundles.reduce((sum, group) => {
          const discount = bundleDiscounts[group.bundleId] ?? 0;
          if (!discount) return sum;
          const original = group.instances
            .flatMap((inst) => inst.items)
            .reduce((s, i) => s + parseFloat(i.total.replace(/[^0-9.]/g, '') || '0'), 0);
          return sum + original * (discount / 100);
        }, 0);

        return (
          <dl className={styles.totals}>
            <div className={styles.row}>
              <dt>Subtotal</dt>
              <dd>{subscription ? `$${subscription.recurring.toFixed(2)}` : cart.subtotal}</dd>
            </div>

            {totalBundleDiscount > 0 && (
              <div className={`${styles.row} ${styles.rowDiscount}`}>
                <dt>Bundle Discount</dt>
                <dd>-${totalBundleDiscount.toFixed(2)}</dd>
              </div>
            )}

            {hasDiscount && (
              <div className={`${styles.row} ${styles.rowDiscount}`}>
                <dt>Coupon Discount</dt>
                <dd>-{cart.discountTotal}</dd>
              </div>
            )}

            <div className={styles.row}>
              <dt>Shipping</dt>
              <dd>
                {cart.shippingTotal && parseFloat(cart.shippingTotal.replace(/[^0-9.-]/g, '')) > 0
                  ? cart.shippingTotal
                  : 'Calculated at checkout'}
              </dd>
            </div>

            <div className={`${styles.row} ${styles.rowTotal}`}>
              <dt>Total</dt>
              <dd>{subscription ? `$${subscription.total.toFixed(2)}` : cart.total}</dd>
            </div>

            {subscription && (
              <div className={styles.row}>
                <dt>Recurring subtotal</dt>
                <dd>${subscription.recurring.toFixed(2)} every {subscription.label}</dd>
              </div>
            )}
          </dl>
        );
      })()}
    </div>
  );
}
