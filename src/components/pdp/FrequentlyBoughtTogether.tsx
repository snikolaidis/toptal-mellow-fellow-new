import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { recordWidgetSource } from '@/lib/widgetAttribution';
import styles from './FrequentlyBoughtTogether.module.css';

interface RecProduct {
  id: string;
  databaseId: number;
  name: string;
  slug: string;
  price: string;
  regularPrice?: string;
  salePrice?: string;
  image?: { sourceUrl: string; altText?: string };
  stockStatus?: string;
  typeLabel?: string;
  subtitle?: string;
  bbBundleMode?: 'byob' | 'fixed' | 'mystery' | null;
  bbFixedPrice?: number | null;
  bbFixedOriginalPrice?: number | null;
}

interface FbtItem {
  databaseId: number;
  slug: string;
  name: string;
  image?: { sourceUrl: string; altText?: string };
  typeLabel?: string;
  subtitle?: string;
  current: number;
  original: number | null;
  isFixedBundle: boolean;
}

interface Props {
  productId: number;
  productSlug: string;
  productName: string;
  productPrice: string;
  productRegularPrice?: string;
  productImage?: { sourceUrl: string; altText?: string };
  productTypeLabel?: string;
  productSubtitle?: string;
  typeSlugs: string[];
  productBundleMode?: 'byob' | 'fixed' | 'mystery' | null;
  productFixedPrice?: number | null;
  productFixedOriginalPrice?: number | null;
}

function parsePrice(price: string | undefined): number {
  if (!price) return 0;
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function FrequentlyBoughtTogether({
  productId,
  productSlug,
  productName,
  productPrice,
  productRegularPrice,
  productImage,
  productTypeLabel,
  productSubtitle,
  typeSlugs,
  productBundleMode,
  productFixedPrice,
  productFixedOriginalPrice,
}: Props) {
  const { addToCart, addFixedBundleToCart } = useCart();
  const [recs, setRecs] = useState<RecProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [addAllError, setAddAllError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const typeKey = typeSlugs.join(',');

  useEffect(() => {
    if (!productId || !typeKey) {
      setRecs([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      context: 'fbt',
      productTypes: typeKey,
      excludeProductIds: String(productId),
      cartProductSlugs: productSlug,
      cartTotal: String(parsePrice(productPrice)),
      limit: '2',
    });
    setLoading(true);
    fetch(`/api/shop/recommendations?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRecs(data.success ? data.products || [] : []);
      })
      .catch(() => {
        if (!cancelled) setRecs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, productSlug, productPrice, typeKey]);

  const items = useMemo<FbtItem[]>(() => {
    const currentIsFixedBundle = productBundleMode === 'fixed' || productBundleMode === 'mystery';
    const currentPrice = currentIsFixedBundle
      ? productFixedPrice ?? 0
      : parsePrice(productPrice);
    const currentRegular = currentIsFixedBundle
      ? productFixedOriginalPrice ?? 0
      : parsePrice(productRegularPrice);
    const currentItem: FbtItem = {
      databaseId: productId,
      slug: productSlug,
      name: productName,
      image: productImage,
      typeLabel: productTypeLabel,
      subtitle: productSubtitle,
      current: currentPrice,
      original: currentRegular > currentPrice ? currentRegular : null,
      isFixedBundle: currentIsFixedBundle,
    };
    const recItems: FbtItem[] = recs.map((r) => {
      const isFixedBundle = r.bbBundleMode === 'fixed' || r.bbBundleMode === 'mystery';
      const current = isFixedBundle
        ? r.bbFixedPrice ?? 0
        : parsePrice(r.salePrice) || parsePrice(r.price);
      const regular = isFixedBundle ? r.bbFixedOriginalPrice ?? 0 : parsePrice(r.regularPrice);
      return {
        databaseId: r.databaseId,
        slug: r.slug,
        name: r.name,
        image: r.image,
        typeLabel: r.typeLabel,
        subtitle: r.subtitle,
        current,
        original: regular > current ? regular : null,
        isFixedBundle,
      };
    });
    return [currentItem, ...recItems];
  }, [
    productId,
    productSlug,
    productName,
    productPrice,
    productRegularPrice,
    productImage,
    productTypeLabel,
    productSubtitle,
    productBundleMode,
    productFixedPrice,
    productFixedOriginalPrice,
    recs,
  ]);

  const itemsKey = items.map((i) => i.databaseId).join(',');

  useEffect(() => {
    setChecked(new Set(items.map((i) => i.databaseId)));
  }, [itemsKey]);

  const toggle = useCallback((id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const total = useMemo(
    () => items.reduce((sum, i) => (checked.has(i.databaseId) ? sum + i.current : sum), 0),
    [items, checked]
  );

  const addAll = useCallback(async () => {
    setAddingAll(true);
    setAddAllError(null);
    try {
      for (const item of items) {
        if (!checked.has(item.databaseId)) continue;
        // The current product is added here too, same as any companion item
        // — checking it and clicking Add All adds it through this widget on
        // top of whatever the page's own separate Add to Cart/Add to Bundle
        // button already added if the shopper also used that, which is
        // accepted as-is.
        recordWidgetSource(item.databaseId, 'fbt');
        if (item.isFixedBundle) {
          await addFixedBundleToCart(item.databaseId, 1, item.name, item.image ? {
            sourceUrl: item.image.sourceUrl,
            altText: item.image.altText || item.name,
          } : null);
        } else {
          await addToCart({ productId: item.databaseId, quantity: 1 });
        }
      }
    } catch (err) {
      setAddAllError(err instanceof Error ? err.message : 'Could not add these items to your cart.');
    } finally {
      setAddingAll(false);
    }
  }, [items, checked, addToCart, addFixedBundleToCart]);

  if (!loading && recs.length === 0) return null;

  const checkedCount = items.reduce((n, i) => (checked.has(i.databaseId) ? n + 1 : n), 0);

  return (
    <section className={styles.fbt}>
      <h2 className={styles.title}>Frequently Bought Together</h2>
      {loading ? (
        <p className={styles.loading}>Loading recommendations...</p>
      ) : (
        <>
          <div className={styles.row}>
            {items.map((item, idx) => {
              const isChecked = checked.has(item.databaseId);
              return (
                <Fragment key={item.databaseId}>
                  <div className={styles.card}>
                    <button
                      type="button"
                      className={`${styles.check} ${isChecked ? styles.checkOn : ''}`}
                      onClick={() => toggle(item.databaseId)}
                      aria-label={isChecked ? 'Remove from bundle' : 'Add to bundle'}
                    >
                      {isChecked && (
                        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                          <path
                            d="M20 6L9 17l-5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <Link href={`/products/${item.slug}`} className={styles.imageLink}>
                      {item.image?.sourceUrl ? (
                        <Image
                          src={item.image.sourceUrl}
                          alt={item.image.altText || item.name}
                          width={160}
                          height={160}
                          className={styles.image}
                        />
                      ) : (
                        <div className={styles.imagePlaceholder} />
                      )}
                    </Link>
                    {item.typeLabel ? <span className={styles.typeLabel}>{item.typeLabel}</span> : null}
                    <Link href={`/products/${item.slug}`} className={styles.name}>
                      {item.name}
                    </Link>
                    {item.subtitle ? <span className={styles.subtitle}>{item.subtitle}</span> : null}
                    <span className={styles.priceRow}>
                      <span className={styles.price}>{formatPrice(item.current)}</span>
                      {item.original ? (
                        <span className={styles.priceOriginal}>{formatPrice(item.original)}</span>
                      ) : null}
                    </span>
                  </div>
                  {idx < items.length - 1 && <span className={styles.plus}>+</span>}
                </Fragment>
              );
            })}
          </div>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Total Price:</span>
            <span className={styles.totalValue}>{formatPrice(total)}</span>
          </div>
          <button
            type="button"
            className={styles.addAllBtn}
            onClick={addAll}
            disabled={addingAll || checkedCount === 0}
          >
            {addingAll ? 'Adding...' : 'Add All Items'}
          </button>
          {addAllError && (
            <p className={styles.error} role="alert">
              {addAllError}
            </p>
          )}
        </>
      )}
    </section>
  );
}
