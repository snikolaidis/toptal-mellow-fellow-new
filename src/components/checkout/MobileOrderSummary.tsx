import { useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
import { ChevronUpIcon, CloseIcon } from '@/components/icons';
import LoyaltyCheckoutRewards from '@/components/LoyaltyCheckoutRewards';
import styles from './MobileOrderSummary.module.css';

interface CartItem {
  key: string;
  quantity: number;
  total: string;
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
}

interface MobileOrderSummaryProps {
  cart: Cart;
  subscription?: { savings: number; recurring: number; total: number; label: string };
  subscriptionSlot?: ReactNode;
}

export default function MobileOrderSummary({ cart, subscription, subscriptionSlot }: MobileOrderSummaryProps) {
  const { applyCoupon, removeCoupon, error: cartError, updateQuantity, removeFromCart } = useCart();
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);

  const handleUpdateQuantity = useCallback(async (key: string, quantity: number) => {
    setMutatingKey(key);
    try {
      await updateQuantity(key, quantity);
    } finally {
      setMutatingKey(null);
    }
  }, [updateQuantity]);

  const handleRemoveItem = useCallback(async (key: string) => {
    setMutatingKey(key);
    try {
      await removeFromCart(key);
    } finally {
      setMutatingKey(null);
    }
  }, [removeFromCart]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setIsApplying(true);
    const success = await applyCoupon(couponCode.trim());
    if (success) {
      setCouponCode('');
    }
    setIsApplying(false);
  };

  const handleRemoveCoupon = async (code: string) => {
    try {
      await removeCoupon(code);
    } catch {
      void 0;
    }
  };

  const hasDiscount = cart.discountTotal &&
    parseFloat(cart.discountTotal.replace(/[^0-9.-]/g, '')) > 0;

  const displayTotal = subscription ? `$${subscription.total.toFixed(2)}` : cart.total;

  const summary = (
    <div className={`${styles.mobileSummary} ${isExpanded ? styles.expanded : ''}`}>
      {/* Collapsed: Total bar */}
      <button
        className={styles.summaryBar}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="mobile-summary-panel"
      >
        <div className={styles.toggle}>
          <span>Order summary</span>
          <ChevronUpIcon />
        </div>
        <div className={styles.total}>
          <span className={styles.totalLabel}>Total</span>
          <span className={styles.totalAmount}>{displayTotal}</span>
        </div>
      </button>

      {/* Expanded: Full breakdown */}
      {isExpanded && (
        <div
          id="mobile-summary-panel"
          className={styles.panel}
        >
          {/* Product list */}
          <ul className={styles.items}>
            {cart.items.map((item) => {
              const isMutating = mutatingKey === item.key;
              const isBundleItem = !!item.bbGroupKey;
              return (
                <li key={item.key} className={styles.item}>
                  <div className={styles.itemImage}>
                    {item.product.image ? (
                      <Image
                        src={item.product.image.sourceUrl}
                        alt={item.product.image.altText || item.product.name}
                        width={48}
                        height={48}
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
                    {!isBundleItem && (
                      <div className={styles.itemQtyRow}>
                        <div className={styles.qtyControls}>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => handleUpdateQuantity(item.key, item.quantity - 1)}
                            disabled={isMutating}
                            aria-label={item.quantity <= 1 ? 'Remove item' : 'Decrease quantity'}
                          >
                            &minus;
                          </button>
                          <span className={styles.qtyValue}>{item.quantity}</span>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => handleUpdateQuantity(item.key, item.quantity + 1)}
                            disabled={isMutating}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.removeItemBtn}
                          onClick={() => handleRemoveItem(item.key)}
                          disabled={isMutating}
                          aria-label={`Remove ${item.product.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={styles.itemTotal}>{item.total}</span>
                </li>
              );
            })}
          </ul>

          <LoyaltyCheckoutRewards />

          <div className={styles.couponSection}>
            <form onSubmit={handleApplyCoupon} className={styles.couponForm}>
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Discount code"
                disabled={isApplying}
                className={cartError ? 'error' : ''}
              />
              <button
                type="submit"
                disabled={isApplying || !couponCode.trim()}
                className={styles.couponApplyBtn}
              >
                {isApplying ? 'Applying...' : 'Apply'}
              </button>
            </form>
            {cartError && <p className={styles.couponError}>{cartError}</p>}
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
          <dl className={styles.totals}>
            <div className={styles.row}>
              <dt>Subtotal</dt>
              <dd>{subscription ? `$${subscription.recurring.toFixed(2)}` : cart.subtotal}</dd>
            </div>

            <div className={styles.row}>
              <dt>Shipping</dt>
              <dd>
                {cart.shippingTotal && parseFloat(cart.shippingTotal.replace(/[^0-9.-]/g, '')) > 0
                  ? cart.shippingTotal
                  : 'Calculated at checkout'}
              </dd>
            </div>

            {hasDiscount && (
              <div className={`${styles.row} ${styles.rowDiscount}`}>
                <dt>Discount</dt>
                <dd>-{cart.discountTotal}</dd>
              </div>
            )}

            <div className={`${styles.row} ${styles.rowTotal}`}>
              <dt>Total</dt>
              <dd>{displayTotal}</dd>
            </div>

            {subscription && (
              <div className={styles.row}>
                <dt>Recurring subtotal</dt>
                <dd>${subscription.recurring.toFixed(2)} every {subscription.label}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );

  if (!mounted) return null;

  return createPortal(summary, document.body);
}
