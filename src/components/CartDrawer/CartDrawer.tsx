import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart, groupCartItems } from '@/context/CartContext';
import { MellowFellowLogo, CloseIcon } from '@/components/icons';
import type { Product } from '@/types/woocommerce';
import styles from './CartDrawer.module.css';

const FREE_SHIPPING_THRESHOLD = 80;

function parsePrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

export default function CartDrawer() {
  const {
    cart,
    isDrawerOpen,
    isMutating,
    closeDrawer,
    updateQuantity,
    removeFromCart,
    removeBundleGroup,
    addBundleToCart,
    addToCart,
    bundleNames,
    bundleDiscounts,
  } = useCart();

  const { bundles, standalone } = groupCartItems(cart?.items ?? [], bundleNames);
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<Product[]>([]);
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

  const handleRemoveBundleGroup = useCallback(async (groupKey: string, keys: string[]) => {
    setRemovingGroupKey(groupKey);
    try { await removeBundleGroup(keys); } finally { setRemovingGroupKey(null); }
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

  // Fetch recommendations when cart items change
  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      setRecommendations([]);
      return;
    }

    const allTypeSlugs = cart.items.flatMap(
      (item) => item.product.productTypes?.map((t) => t.slug) || []
    );
    const productTypeSlugs = allTypeSlugs.filter(
      (slug, index) => allTypeSlugs.indexOf(slug) === index
    );
    const excludeIds = cart.items.map((item) => item.product.databaseId);
    const productSlugs = cart.items.map((item) => item.product.slug);
    const subtotal = parsePrice(cart.subtotal);

    const params = new URLSearchParams({
      cartTotal: String(subtotal),
      excludeProductIds: excludeIds.join(','),
      cartProductSlugs: productSlugs.join(','),
      limit: '4',
    });

    if (productTypeSlugs.length > 0) {
      params.set('productTypes', productTypeSlugs.join(','));
    } else {
      params.set('cartProductIds', excludeIds.join(','));
    }

    // Only fetch if drawer is open — avoid unnecessary API calls
    if (!isDrawerOpen) return;

    setRecsLoading(true);
    fetch(`/api/shop/recommendations?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setRecommendations(data.products);
      })
      .catch(() => setRecommendations([]))
      .finally(() => setRecsLoading(false));
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

  // Shipping progress
  const subtotal = parsePrice(cart?.subtotal || '0');
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const progress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const hasFreeShipping = remaining <= 0;

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

        {/* Progress bar */}
        <div className={styles.progressSection}>
          <p className={styles.progressText}>
            {hasFreeShipping ? (
              <>You have qualified for <strong>FREE shipping!</strong></>
            ) : (
              <>
                You are <strong className={styles.progressAmount}>${remaining.toFixed(2)} USD</strong> away
                from <strong>FREE shipping!</strong>
              </>
            )}
          </p>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Mutating indicator — thin bar that appears during any cart operation */}
        {isMutating && <div className={styles.mutatingBar} />}

        {/* Scrollable content */}
        <div className={styles.content}>
          {!cart || cart.items.length === 0 ? (
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
                  const discount = bundleDiscounts[group.bundleId] ?? 0;
                  const allItems = group.instances.flatMap((inst) => inst.items);
                  const originalTotal = allItems.reduce(
                    (sum, i) => sum + parsePrice(i.total), 0
                  );
                  const discountedTotal = discount > 0
                    ? originalTotal * (1 - discount / 100)
                    : originalTotal;

                  const isRemoving = removingGroupKey === group.mergeKey;
                  return (
                    <li key={group.mergeKey} className={`${styles.bundleGroup} ${isRemoving ? styles.bundleGroupPending : ''}`}>
                      <div className={styles.bundleGroupHeader}>
                        <span className={styles.bundleGroupName}>{group.bundleName}</span>
                        <button
                          className={styles.bundleDeleteBtn}
                          disabled={isRemoving}
                          onClick={() =>
                            handleRemoveBundleGroup(group.mergeKey, allItems.map((i) => i.key))
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
                        .reduce<{ item: typeof group.representativeItems[0]; qty: number; totalAmount: number }[]>(
                          (acc, item) => {
                            const existing = acc.find(
                              (r) => r.item.product.databaseId === item.product.databaseId
                            );
                            const lineTotal = parsePrice(item.total);
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
                                    href={`/product/${item.product.slug}`}
                                    className={styles.itemName}
                                    onClick={closeDrawer}
                                  >
                                    {item.product.name}
                                  </Link>
                                  <span className={styles.bundleItemQty}>×{qty}</span>
                                </div>
                                <div className={styles.bundleItemPrices}>
                                  {discount > 0 && (
                                    <span className={styles.bundleOriginalPrice}>
                                      ${totalAmount.toFixed(2)}
                                    </span>
                                  )}
                                  <span className={styles.itemPrice}>${itemDiscounted.toFixed(2)}</span>
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
                                group.instances[group.instances.length - 1].items.map((i) => i.key)
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
                          {discount > 0 && (
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
                            href={`/product/${item.product.slug}`}
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
                          <span className={styles.itemPrice}>{item.total}</span>
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
                          href={`/product/${product.slug}`}
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
                            href={`/product/${product.slug}`}
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
            {(() => {
              const totalBundleDiscount = bundles.reduce((sum, group) => {
                const discount = bundleDiscounts[group.bundleId] ?? 0;
                if (!discount) return sum;
                const original = group.instances
                  .flatMap((inst) => inst.items)
                  .reduce((s, i) => s + parsePrice(i.total), 0);
                return sum + original * (discount / 100);
              }, 0);
              const effectiveSubtotal = parsePrice(cart.subtotal) - totalBundleDiscount;

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
