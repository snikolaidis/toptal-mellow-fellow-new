import { useState } from 'react';
import Image from 'next/image';
import { ChevronUpIcon } from '@/components/icons';
import styles from './MobileOrderSummary.module.css';

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
}

interface MobileOrderSummaryProps {
  cart: Cart;
  subscription?: { savings: number; recurring: number; label: string };
}

export default function MobileOrderSummary({ cart, subscription }: MobileOrderSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasDiscount = cart.discountTotal &&
    parseFloat(cart.discountTotal.replace(/[^0-9.-]/g, '')) > 0;

  const displayTotal = subscription ? `$${subscription.recurring.toFixed(2)}` : cart.total;

  return (
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
            {cart.items.map((item) => (
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
                </div>
                <span className={styles.itemTotal}>{item.total}</span>
              </li>
            ))}
          </ul>

          {/* Totals */}
          <dl className={styles.totals}>
            <div className={styles.row}>
              <dt>Subtotal</dt>
              <dd>{subscription ? `$${subscription.recurring.toFixed(2)}` : cart.subtotal}</dd>
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
}
