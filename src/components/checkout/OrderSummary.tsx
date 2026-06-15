import { useState } from 'react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
import { CloseIcon } from '@/components/icons';
import LoyaltyCheckoutRewards from '@/components/LoyaltyCheckoutRewards';
import styles from './OrderSummary.module.css';

interface CartItem {
  key: string;
  quantity: number;
  total: string;
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
}

export default function OrderSummary({ cart }: OrderSummaryProps) {
  const { applyCoupon, removeCoupon, error: cartError } = useCart();
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
        {cart.items.map((item) => (
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

      {/* Totals */}
      <dl className={styles.totals}>
        <div className={styles.row}>
          <dt>Subtotal</dt>
          <dd>{cart.subtotal}</dd>
        </div>

        {hasDiscount && (
          <div className={`${styles.row} ${styles.rowDiscount}`}>
            <dt>Discount</dt>
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
          <dd>{cart.total}</dd>
        </div>
      </dl>
    </div>
  );
}
