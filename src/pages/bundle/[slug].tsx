import Image from 'next/image';
import { GetStaticPaths, GetStaticProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { getClient } from '@/lib/apollo-client';
import { useCart } from '@/context/CartContext';
import { GET_BYOB_BUNDLE_BY_SLUG } from '@/graphql/queries/bundles';
import styles from '@/styles/pages/bundle.module.css';

interface BundleProduct {
  databaseId: number;
  name: string;
  sku: string;
  price?: string;
  regularPrice?: string;
  image?: {
    sourceUrl: string;
    altText: string;
  };
}

interface DiscountRule {
  minQty: number;
  percent: number;
}

interface BundleData {
  databaseId: number;
  name: string;
  slug: string;
  bbDescription?: string | null;
  image?: {
    sourceUrl: string;
    altText: string;
  } | null;
  bbMinItems: number;
  bbMaxItems?: number | null;
  bbDiscountRules: DiscountRule[];
  bbBundleProducts: BundleProduct[];
}

interface BundlePageProps {
  bundle: BundleData;
}

function parsePrice(str?: string): number {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function BundlePage({ bundle }: BundlePageProps) {
  const { addBundleToCart } = useCart();
  const [selected, setSelected] = useState<BundleProduct[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const products = bundle.bbBundleProducts;
  const maxItems = bundle.bbMaxItems ?? null;
  const hasMax = maxItems != null;

  const activeDiscount = [...(bundle.bbDiscountRules || [])]
    .sort((a, b) => b.minQty - a.minQty)
    .find((rule) => selected.length >= rule.minQty);

  const nextDiscount = [...(bundle.bbDiscountRules || [])]
    .sort((a, b) => a.minQty - b.minQty)
    .find((rule) => selected.length < rule.minQty);

  const subtotal = selected.reduce((sum, p) => sum + parsePrice(p.price), 0);
  const discountedTotal = activeDiscount
    ? subtotal * (1 - activeDiscount.percent / 100)
    : subtotal;

  const progressPercent = hasMax && maxItems > 0 ? (selected.length / maxItems) * 100 : 0;

  const discountLabel = nextDiscount
    ? `Add ${nextDiscount.minQty - selected.length} product(s) to get ${nextDiscount.percent}% discount!`
    : activeDiscount
    ? `${activeDiscount.percent}% discount applied!`
    : null;

  const addProduct = useCallback(
    (product: BundleProduct) => {
      setSelected((prev) => {
        if (hasMax && prev.length >= maxItems) return prev;
        return [...prev, product];
      });
    },
    [hasMax, maxItems]
  );

  const removeProduct = useCallback((databaseId: number) => {
    setSelected((prev) => {
      // Remove the last occurrence of this product
      const lastIdx = prev.map(p => p.databaseId).lastIndexOf(databaseId);
      return prev.filter((_, i) => i !== lastIdx);
    });
  }, []);

  const clearBundle = useCallback(() => setSelected([]), []);

  const handleAddToCart = async () => {
    if (selected.length < bundle.bbMinItems || isAdding) return;
    setAddError(null);
    setIsAdding(true);
    try {
      const productIds = selected.map((p) => p.databaseId);
      await addBundleToCart(bundle.databaseId, productIds, bundle.name, activeDiscount?.percent ?? 0, bundle.image);
      setSelected([]);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add bundle to cart. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  // Collapse duplicates for display: one slot per unique product with a ×qty badge.
  const selectedGroups = selected.reduce<{ product: BundleProduct; qty: number }[]>((acc, p) => {
    const existing = acc.find((g) => g.product.databaseId === p.databaseId);
    if (existing) { existing.qty++; }
    else { acc.push({ product: p, qty: 1 }); }
    return acc;
  }, []);
  // Remaining slots = how many more individual items can still be added.
  // Only meaningful when there's a max — unlimited bundles just show what's picked.
  const remainingItems = hasMax ? maxItems - selected.length : 0;

  return (
    <Layout title={bundle.name}>
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{bundle.name}</h1>
        {bundle.bbDescription && (
          <div
            className={styles.pageDescription}
            dangerouslySetInnerHTML={{ __html: bundle.bbDescription }}
          />
        )}

        <div className={styles.layout}>
          {/* Product Grid */}
          <div className={styles.productGrid}>
            {products.map((product) => {
              const isAtMax = hasMax && selected.length >= maxItems;
              const cardPrice = parsePrice(product.price);
              const cardDiscountedPrice = activeDiscount
                ? cardPrice * (1 - activeDiscount.percent / 100)
                : cardPrice;

              return (
                <div key={product.databaseId} className={styles.productCard}>
                  <div className={styles.productImageWrap}>
                    {product.image?.sourceUrl ? (
                      <Image
                        src={product.image.sourceUrl}
                        alt={product.image.altText || product.name}
                        fill
                        className={styles.productImage}
                        sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 25vw"
                      />
                    ) : (
                      <div className={styles.productImagePlaceholder} />
                    )}
                  </div>

                  <div className={styles.productInfo}>
                    <p className={styles.productName}>{product.name}</p>
                    <div className={styles.productFooter}>
                      <span className={styles.productPrice}>
                        {activeDiscount ? (
                          <>
                            <span className={styles.originalPrice}>{formatPrice(cardPrice)}</span>
                            {formatPrice(cardDiscountedPrice)}
                          </>
                        ) : (
                          formatPrice(cardPrice)
                        )}
                      </span>
                      <button
                        onClick={() => addProduct(product)}
                        disabled={isAtMax}
                        className={styles.addBtn}
                        aria-label={`Add ${product.name} to bundle`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bundle Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>Your Bundle</h2>
              <button
                onClick={clearBundle}
                disabled={selected.length === 0}
                className={styles.clearBtn}
                aria-label="Clear bundle"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
            </div>

            <p className={styles.sidebarSubtitle}>Review your bundle</p>

            {discountLabel && (
              <p className={styles.discountBanner}>{discountLabel}</p>
            )}

            {hasMax && (
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            <p className={styles.itemCount}>{selected.length} item(s)</p>

            {/* Slots */}
            <div className={styles.slots}>
              {selectedGroups.map((group) => (
                <div key={group.product.databaseId} className={`${styles.slot} ${styles.filled}`}>
                  {group.product.image?.sourceUrl && (
                    <Image
                      src={group.product.image.sourceUrl}
                      alt={group.product.image.altText || group.product.name}
                      fill
                      className={styles.slotImage}
                      sizes="80px"
                    />
                  )}
                  {group.qty > 1 && (
                    <span className={styles.slotQty}>×{group.qty}</span>
                  )}
                  <button
                    onClick={() => removeProduct(group.product.databaseId)}
                    className={styles.slotRemoveBtn}
                    aria-label={`Remove ${group.product.name} from bundle`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {hasMax && Array.from({ length: remainingItems }, (_, i) => (
                <div key={`empty-${i}`} className={styles.slot}>
                  <span className={styles.slotNumber}>{selected.length + i + 1}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className={styles.sidebarFooter}>
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalAmount}>
                  {activeDiscount && subtotal > 0 ? (
                    <>
                      <span className={styles.originalPrice}>{formatPrice(subtotal)}</span>
                      {formatPrice(discountedTotal)}
                    </>
                  ) : (
                    formatPrice(subtotal)
                  )}
                </span>
              </div>

              {addError && (
                <p style={{ color: '#b91c1c', fontSize: '0.8125rem', marginBottom: '0.5rem', textAlign: 'center' }}>
                  {addError}
                </p>
              )}
              <button
                onClick={handleAddToCart}
                disabled={selected.length < bundle.bbMinItems || isAdding}
                className={styles.addToCartBtn}
              >
                {isAdding ? (
                  <>
                    <svg className={styles.btnSpinner} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Adding…
                  </>
                ) : (
                  'Add To Cart'
                )}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<BundlePageProps> = async ({ params }) => {
  try {
    const client = getClient();
    const [{ data }, menuClient] = await Promise.all([
      client.query({
        query: GET_BYOB_BUNDLE_BY_SLUG,
        variables: { slug: params?.slug as string },
      }),
      prefetchMenus(),
    ]);

    if (!data?.product || data.product.bbBundleMode !== 'byob') {
      return { notFound: true, revalidate: 60 };
    }

    const props = { bundle: data.product } as any;
    mergeMenuState(props, menuClient);

    // 600, as on the product page: the cart prices from WooCommerce live, and
    // the GraphQL read behind this is edge cached for 600s anyway.
    return { props, revalidate: 600 };
  } catch (error) {
    console.error(`Error fetching bundle "${params?.slug}":`, error);
    return { notFound: true, revalidate: 60 };
  }
};
