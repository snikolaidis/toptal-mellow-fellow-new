import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '@/context/CartContext';
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
    closeDrawer,
    updateQuantity,
    removeFromCart,
    addToCart,
  } = useCart();
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);

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

    setRecsLoading(true);
    fetch(`/api/shop/recommendations?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setRecommendations(data.products);
      })
      .catch(() => setRecommendations([]))
      .finally(() => setRecsLoading(false));
  }, [cart?.items.map((i) => i.product.databaseId).join(','), cart?.subtotal]);

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
                {cart.items.map((item) => (
                  <li key={item.key} className={styles.cartItem}>
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
                          onClick={() => removeFromCart(item.key)}
                          aria-label={`Remove ${item.product.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      {item.variation && (
                        <p className={styles.itemVariation}>{item.variation.name}</p>
                      )}
                      <div className={styles.itemFooter}>
                        <div className={styles.quantityControls}>
                          <button
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(item.key, item.quantity - 1)
                            }
                            aria-label="Decrease quantity"
                          >
                            &minus;
                          </button>
                          <span className={styles.qtyValue}>
                            {item.quantity}
                          </span>
                          <button
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(item.key, item.quantity + 1)
                            }
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <span className={styles.itemPrice}>{item.total}</span>
                      </div>
                    </div>
                  </li>
                ))}
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
            <div className={styles.subtotalRow}>
              <span className={styles.subtotalLabel}>SUBTOTAL</span>
              <span className={styles.subtotalValue}>{cart.subtotal}</span>
            </div>
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
