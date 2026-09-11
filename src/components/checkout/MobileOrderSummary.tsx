import { useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useCart, groupCartItems } from '@/context/CartContext';
import { ChevronUpIcon, ChevronDownIcon, CloseIcon } from '@/components/icons';
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
    regularPrice?: string;
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

// Bundle/sale discounts apply via the product's own sale price, not a coupon,
// so `product.price` is already the discounted unit price — `regularPrice`
// (when present) is the only source for the true original price.
function originalUnitPrice(item: { product: { price: string; regularPrice?: string } }): number {
  return parseFloat((item.product.regularPrice || item.product.price).replace(/[^0-9.]/g, '')) || 0;
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

interface MobileOrderSummaryProps {
  cart: Cart;
  subscription?: { savings: number; recurring: number; total: number; label: string };
  subscriptionSlot?: ReactNode;
}

export default function MobileOrderSummary({ cart, subscription, subscriptionSlot }: MobileOrderSummaryProps) {
  const {
    applyCoupon,
    removeCoupon,
    error: cartError,
    updateQuantity,
    removeFromCart,
    bundleNames,
    bundleImages,
    bundleDiscounts,
    bundleModes,
    bundleGroupSetCounts,
    addBundleToCart,
    addFixedBundleToCart,
    removeBundleGroup,
  } = useCart();
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [mutatingGroupKey, setMutatingGroupKey] = useState<string | null>(null);
  // Bundle groups collapse to a single "name - price" row by default; this
  // tracks which ones the shopper has expanded to see the bundled products.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroupExpanded = useCallback((mergeKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(mergeKey)) {
        next.delete(mergeKey);
      } else {
        next.add(mergeKey);
      }
      return next;
    });
  }, []);

  const { bundles, standalone } = groupCartItems(cart.items as any[], bundleNames, bundleImages, bundleModes, bundleGroupSetCounts);

  // Shown as its own coupon-style row in the totals, same as an applied
  // coupon — the sum of every bundle group's (original - discounted) total.
  const totalBundleDiscount = bundles.reduce((sum, group) => {
    const allItems = group.instances.flatMap((inst) => inst.items);
    const original = allItems.reduce(
      (s, i) => s + i.quantity * originalUnitPrice(i), 0
    );
    const discounted = allItems.reduce(
      (s, i) => s + parseFloat(i.total.replace(/[^0-9.]/g, '') || '0'), 0
    );
    return sum + Math.max(0, original - discounted);
  }, 0);

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

  const handleAddAnotherBundle = useCallback(async (group: (typeof bundles)[number]) => {
    setMutatingGroupKey(group.mergeKey);
    try {
      if (group.bundleMode === 'fixed') {
        await addFixedBundleToCart(group.bundleId, 1, group.bundleName, group.image);
      } else {
        await addBundleToCart(
          group.bundleId,
          group.representativeItems.flatMap((i) => Array(i.quantity).fill(i.product.databaseId)),
          group.bundleName,
          bundleDiscounts[group.bundleId] ?? 0,
          group.image,
          false
        );
      }
    } catch {
      // Failure reason is already surfaced via the shared cartError banner —
      // this just stops it from becoming an unhandled promise rejection.
    } finally {
      setMutatingGroupKey(null);
    }
  }, [addBundleToCart, addFixedBundleToCart, bundleDiscounts]);

  const handleRemoveOneBundle = useCallback(async (group: (typeof bundles)[number]) => {
    setMutatingGroupKey(group.mergeKey);
    try {
      await removeBundleGroup([group.instances[group.instances.length - 1].groupKey]);
    } finally {
      setMutatingGroupKey(null);
    }
  }, [removeBundleGroup]);

  const handleRemoveBundleGroup = useCallback(async (group: (typeof bundles)[number]) => {
    setMutatingGroupKey(group.mergeKey);
    try {
      await removeBundleGroup(group.instances.map((inst) => inst.groupKey));
    } finally {
      setMutatingGroupKey(null);
    }
  }, [removeBundleGroup]);

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
            {/* Bundle groups */}
            {bundles.map((group) => {
              const allItems = group.instances.flatMap((inst) => inst.items);
              const originalTotal = allItems.reduce(
                (sum, i) => sum + i.quantity * originalUnitPrice(i), 0
              );
              const discountedTotal = allItems.reduce(
                (sum, i) => sum + parseFloat(i.total.replace(/[^0-9.]/g, '') || '0'), 0
              );
              const groupHasDiscount = discountedTotal < originalTotal - 0.005;
              const isGroupExpanded = expandedGroups.has(group.mergeKey);
              const panelId = `mobile-bundle-panel-${group.mergeKey}`;

              return (
                <li key={group.mergeKey} className={styles.bundleGroup}>
                  <div className={styles.bundleGroupHeader}>
                    <div className={styles.itemImage}>
                      {group.image ? (
                        <Image
                          src={group.image.sourceUrl}
                          alt={group.image.altText || group.bundleName}
                          width={64}
                          height={64}
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div className={styles.placeholderImage} />
                      )}
                      <span className={styles.itemQuantity}>{group.quantity}</span>
                    </div>
                    <div className={styles.bundleHeaderDetails}>
                      <div className={styles.bundleHeaderTop}>
                        <span className={styles.bundleGroupName}>{group.bundleName}</span>
                        <div className={styles.bundleHeaderPrices}>
                          {groupHasDiscount && (
                            <span className={styles.bundleOriginalTotal}>
                              ${originalTotal.toFixed(2)}
                            </span>
                          )}
                          <span className={styles.bundleDiscountedTotal}>
                            ${discountedTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.bundleToggleBtn}
                        onClick={() => toggleGroupExpanded(group.mergeKey)}
                        aria-expanded={isGroupExpanded}
                        aria-controls={panelId}
                      >
                        <span className={`${styles.bundleChevron} ${isGroupExpanded ? styles.bundleChevronExpanded : ''}`}>
                          <ChevronDownIcon />
                        </span>
                        {isGroupExpanded ? 'Hide items' : 'Show items'}
                      </button>
                      <div className={styles.itemQtyRow}>
                        <div className={styles.qtyControls}>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => handleRemoveOneBundle(group)}
                            disabled={mutatingGroupKey === group.mergeKey}
                            aria-label={group.quantity <= 1 ? `Remove ${group.bundleName}` : 'Decrease quantity'}
                          >
                            &minus;
                          </button>
                          <span className={styles.qtyValue}>{group.quantity}</span>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => handleAddAnotherBundle(group)}
                            disabled={mutatingGroupKey === group.mergeKey}
                            aria-label={`Add another ${group.bundleName}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.removeItemBtn}
                          onClick={() => handleRemoveBundleGroup(group)}
                          disabled={mutatingGroupKey === group.mergeKey}
                          aria-label={`Remove all ${group.bundleName}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                  {isGroupExpanded && (
                    <div id={panelId} className={styles.bundleItemsPanel}>
                      {allItems
                        .reduce<{ item: typeof allItems[0]; qty: number; originalAmount: number; totalAmount: number }[]>(
                          (acc, item) => {
                            const existing = acc.find(
                              (r) => r.item.product.databaseId === item.product.databaseId
                            );
                            const lineOriginal = item.quantity * originalUnitPrice(item);
                            const lineTotal = parseFloat(item.total.replace(/[^0-9.]/g, '') || '0');
                            if (existing) {
                              existing.qty += item.quantity;
                              existing.originalAmount += lineOriginal;
                              existing.totalAmount += lineTotal;
                            } else {
                              acc.push({ item, qty: item.quantity, originalAmount: lineOriginal, totalAmount: lineTotal });
                            }
                            return acc;
                          },
                          []
                        )
                        .map(({ item, qty, originalAmount, totalAmount }) => {
                          const itemHasDiscount = totalAmount < originalAmount - 0.005;
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
                                {itemHasDiscount && (
                                  <span className={styles.bundleOriginalPrice}>
                                    ${originalAmount.toFixed(2)}
                                  </span>
                                )}
                                <span className={styles.itemTotal}>${totalAmount.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </li>
              );
            })}

            {/* Standalone items */}
            {standalone.map((item) => {
              const isMutating = mutatingKey === item.key;
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
                  </div>
                  <div className={styles.bundleItemTotal}>
                    {(() => {
                      const originalLineTotal = item.quantity * originalUnitPrice(item);
                      return originalLineTotal > parseFloat(item.total.replace(/[^0-9.]/g, '') || '0') + 0.005 && (
                        <span className={styles.bundleOriginalPrice}>${originalLineTotal.toFixed(2)}</span>
                      );
                    })()}
                    <span className={styles.itemTotal}>{item.total}</span>
                  </div>
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
                    {coupon.discountAmount && parseFloat(coupon.discountAmount.replace(/[^0-9.]/g, '') || '0') > 0 && (
                      <span className={styles.couponAmount}>-{coupon.discountAmount}</span>
                    )}
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

          {/* Totals — gross Subtotal, Bundle Discount broken out, the rest
              consolidated into "You saved", net Total. Mirrors OrderSummary. */}
          {(() => {
            const grossSubtotal = cart.items.reduce(
              (s, i) => s + i.quantity * parseFloat(i.product.price.replace(/[^0-9.]/g, '') || '0'), 0
            );
            const netMerch = cart.items.reduce(
              (s, i) => s + parseFloat(i.total.replace(/[^0-9.]/g, '') || '0'), 0
            );
            const saved = Math.max(0, grossSubtotal - netMerch);
            const otherSaved = Math.max(0, saved - totalBundleDiscount);
            return (
              <dl className={styles.totals}>
                <div className={styles.row}>
                  <dt>Subtotal</dt>
                  <dd>{subscription ? `$${subscription.recurring.toFixed(2)}` : `$${grossSubtotal.toFixed(2)}`}</dd>
                </div>

                {!subscription && totalBundleDiscount > 0 && (
                  <div className={`${styles.row} ${styles.rowDiscount}`}>
                    <dt>Bundle Discount</dt>
                    <dd>-${totalBundleDiscount.toFixed(2)}</dd>
                  </div>
                )}

                {!subscription && otherSaved > 0 && (
                  <div className={`${styles.row} ${styles.rowDiscount}`}>
                    <dt>You saved</dt>
                    <dd>-${otherSaved.toFixed(2)}</dd>
                  </div>
                )}

                <div className={styles.row}>
                  <dt>Shipping</dt>
                  <dd>
                    {cart.shippingTotal
                      ? parseFloat(cart.shippingTotal.replace(/[^0-9.-]/g, '')) > 0
                        ? cart.shippingTotal
                        : cart.chosenShippingMethods?.length ? 'Free' : 'Calculated at checkout'
                      : 'Calculated at checkout'}
                  </dd>
                </div>

                {cart.appliedCoupons && cart.appliedCoupons.map((coupon) => {
                  const amt = parseFloat(coupon.discountAmount.replace(/[^0-9.]/g, '') || '0');
                  if (amt <= 0) return null;
                  return (
                    <div key={coupon.code} className={`${styles.row} ${styles.rowDiscount}`}>
                      <dt>{coupon.code.toUpperCase()}</dt>
                      <dd>-{coupon.discountAmount}</dd>
                    </div>
                  );
                })}

                <div className={`${styles.row} ${styles.rowTotal}`}>
                  <dt>Total</dt>
                  <dd>{displayTotal}</dd>
                </div>

                {subscription && (
                  <div className={styles.row}>
                    <dt>Recurring subtotal</dt>
                    <dd>${subscription.recurring.toFixed(2)} {subscription.label}</dd>
                  </div>
                )}
              </dl>
            );
          })()}
        </div>
      )}
    </div>
  );

  if (!mounted) return null;

  return createPortal(summary, document.body);
}
