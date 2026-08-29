import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart, groupCartItems } from '@/context/CartContext';
import { MellowFellowLogo, CloseIcon } from '@/components/icons';
import type { Product } from '@/types/woocommerce';
import {
  buildRecsCacheKey,
  getCachedRecs,
  isRecsFresh,
  setRecsCache,
  abortInflightRecs,
  getRecsAbortSignal,
  fetchRecommendations,
} from '@/lib/recsCache';
import TieredProgressBar from './TieredProgressBar';
import FreeGiftWidget from './FreeGiftWidget';
import styles from './CartDrawer.module.css';

function parsePrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

export default function CartDrawer() {
  const {
    cart,
    isDrawerOpen,
    isLoading,
    isMutating,
    error,
    closeDrawer,
    updateQuantity,
    removeFromCart,
    removeBundleGroup,
    addBundleToCart,
    addToCart,
    applyCoupon,
    removeCoupon,
    bundleNames,
    bundleDiscounts,
  } = useCart();

  const { bundles, standalone } = groupCartItems(cart?.items ?? [], bundleNames);
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);
  // removingKey  → the cart item key being deleted (triggers fade + spinner)
  // updatingKey  → the cart item key having its quantity changed (locks buttons only, no fade)
  // removingGroupKey → composite key of the bundle group being deleted (triggers fade + spinner)
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [removingGroupKey, setRemovingGroupKey] = useState<string | null>(null);

  const handleUpdateQuantity = useCallback(async (key: string, qty: number) => {
    setUpdatingKey(key);
    try { await updateQuantity(key, qty); } finally { setUpdatingKey(null); }
  }, [updateQuantity]);

  const handleRemoveFromCart = useCallback(async (key: string) => {
    setRemovingKey(key);
    try { await removeFromCart(key); } finally { setRemovingKey(null); }
  }, [removeFromCart]);

  const handleRemoveBundleGroup = useCallback(async (mergeKey: string, groupKeys: string[]) => {
    setRemovingGroupKey(mergeKey);
    try { await removeBundleGroup(groupKeys); } finally { setRemovingGroupKey(null); }
  }, [removeBundleGroup]);

  // Lock body scroll when open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  // Close on ESC
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    if (isDrawerOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isDrawerOpen, closeDrawer]);

  // Close on route change
  useEffect(() => {
    router.events.on('routeChangeStart', closeDrawer);
    return () => router.events.off('routeChangeStart', closeDrawer);
  }, [router, closeDrawer]);

  // Fetch recommendations with caching, debounce, and AbortController
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      setRecommendations([]);
      return;
    }
    if (!isDrawerOpen) return;

    const productIds = cart.items.map((i) => i.product.databaseId);
    const productSlugs = cart.items.map((i) => i.product.slug);
    const subtotal = parsePrice(cart.subtotal);
    const cacheKey = buildRecsCacheKey(productIds, subtotal);

    // Show cached results immediately (stale-while-revalidate)
    const cached = getCachedRecs(cacheKey);
    if (cached) {
      setRecommendations(cached);
      if (isRecsFresh(cacheKey)) return; // Fresh cache — no fetch needed
    }

    // Debounce rapid cart changes (quantity adjustments)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const signal = getRecsAbortSignal();
      setRecsLoading(true);
      fetchRecommendations(productIds, productSlugs, subtotal, signal)
        .then((products) => {
          setRecommendations(products);
          setRecsCache(cacheKey, products);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') setRecommendations(cached || []);
        })
        .finally(() => setRecsLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortInflightRecs();
    };
  }, [cart?.items.map((i) => i.product.databaseId).join(','), cart?.subtotal, isDrawerOpen]);

  const handleAddRecommendation = useCallback(
    async (product: Product) => {
      setAddingProductId(product.databaseId);
      try {
        await addToCart({ productId: product.databaseId, quantity: 1 });
      } finally {
        setAddingProductId(null);
      }
    },
    [addToCart]
  );

  const subtotal = parsePrice(cart?.subtotal || '0');

  if (!isDrawerOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={closeDrawer} />

      {/* Drawer */}
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLogo}>
            <MellowFellowLogo />
          </div>
          <button
            className={styles.closeBtn}
            onClick={closeDrawer}
            aria-label="Close cart"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Free shipping banner */}
        <div className={styles.shippingBanner}>
          Free shipping on all orders over $80
        </div>

        {/* Tiered offers progress */}
        <TieredProgressBar subtotal={subtotal} />

       
        {/* Mutating indicator — thin bar that appears during any cart operation */}
        {isMutating && <div className={styles.mutatingBar} />}

        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* Scrollable content */}
        <div className={styles.content}>
  
           {/* Selectable Gift With Purchase */}
          <FreeGiftWidget subtotal={subtotal} />


          {isLoading && !cart ? (
            <div className={styles.emptyCart}>
              <p>Loading your cart...</p>
            </div>
          ) : !cart || cart.items.length === 0 ? (
            <div className={styles.emptyCart}>
              <p>Your cart is empty</p>
              <button onClick={closeDrawer} className={styles.emptyShopBtn}>
                Start Shopping
              </button>
            </div>
          ) : (
            <>
              {/* Cart items */}
              <ul className={styles.itemsList}>
                {/* Bundle groups */}
                {bundles.map((group) => {
                  const allItems = group.instances.flatMap((inst) => inst.items);
                  const originalTotal = allItems.reduce(
                    (sum, i) => sum + i.quantity * parsePrice(i.product.price), 0
                  );
                  const discountedTotal = allItems.reduce(
                    (sum, i) => sum + parsePrice(i.total), 0
                  );
                  const hasDiscount = discountedTotal < originalTotal - 0.005;
                  const discount = bundleDiscounts[group.bundleId] ?? 0;

                  const isRemoving = removingGroupKey === group.mergeKey;
                  return (
                    <li key={group.mergeKey} className={`${styles.bundleGroup} ${isRemoving ? styles.bundleGroupPending : ''}`}>
                      <div className={styles.bundleGroupHeader}>
                        <span className={styles.bundleGroupName}>{group.bundleName}</span>
                        <button
                          className={styles.bundleDeleteBtn}
                          disabled={isRemoving}
                          onClick={() =>
                            handleRemoveBundleGroup(group.mergeKey, group.instances.map((inst) => inst.groupKey))
                          }
                          aria-label={`Remove all ${group.bundleName}`}
                        >
                          {isRemoving ? (
                            <svg className={styles.spinner} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                              <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {group.representativeItems
                        .reduce<{ item: typeof group.representativeItems[0]; qty: number; originalAmount: number; totalAmount: number }[]>(
                          (acc, item) => {
                            const existing = acc.find(
                              (r) => r.item.product.databaseId === item.product.databaseId
                            );
                            const lineOriginal = item.quantity * parsePrice(item.product.price);
                            const lineTotal = parsePrice(item.total);
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
                                    width={60}
                                    height={60}
                                    style={{ objectFit: 'contain' }}
                                  />
                                ) : (
                                  <div className={styles.itemImagePlaceholder} />
                                )}
                              </div>
                              <div className={styles.itemDetails}>
                                <div className={styles.itemHeader}>
                                  <Link
                                    href={`/products/${item.product.slug}`}
                                    className={styles.itemName}
                                    onClick={closeDrawer}
                                  >
                                    {item.product.name}
                                  </Link>
                                  <span className={styles.bundleItemQty}>×{qty}</span>
                                </div>
                                <div className={styles.bundleItemPrices}>
                                  {itemHasDiscount && (
                                    <span className={styles.bundleOriginalPrice}>
                                      ${originalAmount.toFixed(2)}
                                    </span>
                                  )}
                                  <span className={styles.itemPrice}>${totalAmount.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      <div className={styles.bundleFooter}>
                        <div className={styles.quantityControls}>
                          <button
                            className={styles.qtyBtn}
                            disabled={isRemoving}
                            onClick={() =>
                              handleRemoveBundleGroup(
                                group.mergeKey,
                                [group.instances[group.instances.length - 1].groupKey]
                              )
                            }
                            aria-label={`Remove one ${group.bundleName}`}
                          >
                            &minus;
                          </button>
                          <span className={styles.qtyValue}>{group.quantity}</span>
                          <button
                            className={styles.qtyBtn}
                            onClick={() =>
                              addBundleToCart(
                                group.bundleId,
                                group.representativeItems.flatMap((i) =>
                                  Array(i.quantity).fill(i.product.databaseId)
                                ),
                                group.bundleName,
                                discount
                              )
                            }
                            aria-label={`Add another ${group.bundleName}`}
                          >
                            +
                          </button>
                        </div>
                        <div className={styles.bundleTotalPrices}>
                          {hasDiscount && (
                            <span className={styles.bundleOriginalTotal}>
                              ${originalTotal.toFixed(2)}
                            </span>
                          )}
                          <span className={styles.bundleDiscountedTotal}>
                            ${discountedTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}

                {/* Standalone items */}
                {standalone.map((item) => {
                  const isItemRemoving = removingKey === item.key;
                  const isItemUpdating = updatingKey === item.key;
                  const isLocked = isItemRemoving || isItemUpdating;
                  return (
                    <li key={item.key} className={`${styles.cartItem} ${isItemRemoving ? styles.cartItemPending : ''}`}>
                      <div className={styles.itemImage}>
                        {item.product.image ? (
                          <Image
                            src={item.product.image.sourceUrl}
                            alt={item.product.image.altText || item.product.name}
                            width={80}
                            height={80}
                            style={{ objectFit: 'contain' }}
                          />
                        ) : (
                          <div className={styles.itemImagePlaceholder} />
                        )}
                      </div>
                      <div className={styles.itemDetails}>
                        <div className={styles.itemHeader}>
                          <Link
                            href={`/products/${item.product.slug}`}
                            className={styles.itemName}
                            onClick={closeDrawer}
                          >
                            {item.product.name}
                          </Link>
                          <button
                            className={styles.itemRemove}
                            onClick={() => handleRemoveFromCart(item.key)}
                            disabled={isLocked}
                            aria-label={`Remove ${item.product.name}`}
                          >
                            {isItemRemoving ? (
                              <svg className={styles.spinner} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                <path d="M12 2a10 10 0 0 1 10 10" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                        {item.variation && (
                          <p className={styles.itemVariation}>{item.variation.name}</p>
                        )}
                        <div className={styles.itemFooter}>
                          <div className={styles.quantityControls}>
                            <button
                              className={styles.qtyBtn}
                              onClick={() => handleUpdateQuantity(item.key, item.quantity - 1)}
                              disabled={isLocked}
                              aria-label="Decrease quantity"
                            >
                              &minus;
                            </button>
                            <span className={styles.qtyValue}>{item.quantity}</span>
                            <button
                              className={styles.qtyBtn}
                              onClick={() => handleUpdateQuantity(item.key, item.quantity + 1)}
                              disabled={isLocked}
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                          <div className={styles.itemPrices}>
                            {item.subtotal && parsePrice(item.subtotal) > parsePrice(item.total) + 0.005 && (
                              <span className={styles.itemOriginalPrice}>{item.subtotal}</span>
                            )}
                            <span className={styles.itemPrice}>{item.total}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className={styles.recommendations}>
                  <h3 className={styles.recsTitle}>You may also like</h3>
                  <div className={styles.recsGrid}>
                    {recommendations.map((product) => (
                      <div key={product.id} className={styles.recCard}>
                        <Link
                          href={`/products/${product.slug}`}
                          className={styles.recImageLink}
                          onClick={closeDrawer}
                        >
                          {product.image?.sourceUrl ? (
                            <Image
                              src={product.image.sourceUrl}
                              alt={product.image.altText || product.name}
                              width={100}
                              height={100}
                              style={{ objectFit: 'contain' }}
                            />
                          ) : (
                            <div className={styles.recImagePlaceholder} />
                          )}
                        </Link>
                        <div className={styles.recInfo}>
                          <Link
                            href={`/products/${product.slug}`}
                            className={styles.recName}
                            onClick={closeDrawer}
                          >
                            {product.name}
                          </Link>
                          <span className={styles.recPrice}>
                            {product.salePrice || product.price}
                          </span>
                          <button
                            className={styles.recAddBtn}
                            onClick={() => handleAddRecommendation(product)}
                            disabled={addingProductId === product.databaseId}
                          >
                            {addingProductId === product.databaseId
                              ? 'Adding...'
                              : 'Add to Cart'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recsLoading && (
                <div className={styles.recsLoading}>
                  <div className="spinner h-5 w-5" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {cart && cart.items.length > 0 && (
          <div className={styles.footer}>
            <form
              className={styles.couponForm}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!couponCode.trim()) return;
                setIsApplyingCoupon(true);
                const ok = await applyCoupon(couponCode.trim());
                if (ok) setCouponCode('');
                setIsApplyingCoupon(false);
              }}
            >
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Discount code"
                disabled={isApplyingCoupon}
                className={styles.couponInput}
              />
              <button
                type="submit"
                disabled={isApplyingCoupon || !couponCode.trim()}
                className={styles.couponApplyBtn}
              >
                {isApplyingCoupon ? '...' : 'Apply'}
              </button>
            </form>

            {cart.appliedCoupons && cart.appliedCoupons.length > 0 && (
              <div className={styles.appliedCoupons}>
                {cart.appliedCoupons.map((coupon) => (
                  <span key={coupon.code} className={styles.appliedCoupon}>
                    {coupon.code}
                    {coupon.discountAmount && parsePrice(coupon.discountAmount) > 0 && (
                      <span className={styles.couponAmount}>-{coupon.discountAmount}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCoupon(coupon.code)}
                      className={styles.couponRemoveBtn}
                      aria-label={`Remove coupon ${coupon.code}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {(() => {
              const totalBundleDiscount = bundles.reduce((sum, group) => {
                const allItems = group.instances.flatMap((inst) => inst.items);
                const original = allItems.reduce((s, i) => s + i.quantity * parsePrice(i.product.price), 0);
                const discounted = allItems.reduce((s, i) => s + parsePrice(i.total), 0);
                return sum + Math.max(0, original - discounted);
              }, 0);
              const couponDiscount = parsePrice(cart.discountTotal);
              const effectiveSubtotal = parsePrice(cart.subtotal) - couponDiscount;

              return (
                <>
                  {totalBundleDiscount > 0 && (
                    <div className={styles.subtotalRow}>
                      <span className={styles.discountLabel}>Bundle Discount</span>
                      <span className={styles.discountValue}>
                        -${totalBundleDiscount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {cart.appliedCoupons && cart.appliedCoupons.map((coupon) => {
                    const amt = parsePrice(coupon.discountAmount);
                    if (amt <= 0) return null;
                    return (
                      <div key={coupon.code} className={styles.subtotalRow}>
                        <span className={styles.discountLabel}>{coupon.code.toUpperCase()}</span>
                        <span className={styles.discountValue}>
                          -${amt.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                  <div className={styles.subtotalRow}>
                    <span className={styles.subtotalLabel}>SUBTOTAL</span>
                    <span className={styles.subtotalValue}>
                      ${effectiveSubtotal.toFixed(2)}
                    </span>
                  </div>
                </>
              );
            })()}
            <p className={styles.shippingNote}>
              Shipping calculated at checkout
            </p>
            <Link
              href="/checkout"
              className={styles.checkoutBtn}
              onClick={closeDrawer}
            >
              Checkout Now
            </Link>
            <button
              type="button"
              className={styles.continueBtn}
              onClick={closeDrawer}
            >
              CONTINUE SHOPPING
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
