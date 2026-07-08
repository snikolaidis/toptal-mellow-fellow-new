import { GetStaticProps, GetStaticPaths } from 'next';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCT_BY_SLUG, GET_ALL_PRODUCT_SLUGS, GET_PRODUCTS_BY_COLLECTION } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import FrequentlyBoughtTogether from '@/components/pdp/FrequentlyBoughtTogether';
import ProductFaqs from '@/components/pdp/ProductFaqs';
import PdpTrustBadges from '@/components/pdp/PdpTrustBadges';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import { useCart } from '@/context/CartContext';
import { klaviyoTrack } from '@/lib/klaviyo';
import { Product, Collection } from '@/types/woocommerce';
import styles from '@/styles/pages/product.module.css';

const YouMayAlsoLike = dynamic(() => import('@/components/pdp/YouMayAlsoLike'), { ssr: false });
const RecentlyViewed = dynamic(() => import('@/components/pdp/RecentlyViewed'), { ssr: false });

const RAW_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const SITE_URL = RAW_SITE_URL && !/^https?:\/\//i.test(RAW_SITE_URL) ? `https://${RAW_SITE_URL}` : RAW_SITE_URL;

interface ProductPageProps {
  product: Product;
  collectionName: string | null;
  collectionSlug: string | null;
  availableOptions: Product[];
  availableOptionsBase: string;
}

function formatEvery(period: string, interval: number) {
  return interval > 1 ? `${interval} ${period}s` : `1 ${period}`;
}

function optionLabel(name: string, base: string): string {
  if (base && name.includes(base)) {
    return name.replace(base, '').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim() || name;
  }
  const packMatch = name.match(/\(([^)]*pack[^)]*)\)/i);
  if (packMatch) return packMatch[1];
  return name;
}

export default function ProductPage({
  product,
  collectionName,
  collectionSlug,
  availableOptions,
  availableOptionsBase,
}: ProductPageProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [subSchemes, setSubSchemes] = useState<
    Array<{ period: string; interval: number; price: string; discount: number }>
  >([]);
  const [subscribe, setSubscribe] = useState(false);
  const [subChoice, setSubChoice] = useState<{ period: string; interval: number } | null>(null);
  const [showSubInfo, setShowSubInfo] = useState(false);
  const { addToCart } = useCart();

  useEffect(() => {
    if (!product?.slug) return;
    addRecentlyViewed({
      databaseId: product.databaseId,
      slug: product.slug,
      name: product.name,
      price: product.price,
      regularPrice: product.regularPrice,
      salePrice: product.salePrice,
      image: product.image
        ? { sourceUrl: product.image.sourceUrl, altText: product.image.altText || product.name }
        : undefined,
      typeLabel: product.mfproductTypes?.nodes?.[0]?.name,
    });
  }, [product?.slug]);

  useEffect(() => {
    const id = product?.databaseId;
    if (!id) {
      setSubSchemes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            query: `{ product(id: ${id}, idType: DATABASE_ID) { ... on SimpleProduct { subscriptionSchemes { period interval price discount } } ... on VariableProduct { subscriptionSchemes { period interval price discount } } } }`,
          }),
        });
        const json = await res.json();
        const schemes = json?.data?.product?.subscriptionSchemes;
        if (cancelled) return;
        if (Array.isArray(schemes) && schemes.length) {
          setSubSchemes(schemes);
          setSubChoice({ period: schemes[0].period, interval: schemes[0].interval });
          setSubscribe(false);
        } else {
          setSubSchemes([]);
          setSubscribe(false);
        }
      } catch {
        if (!cancelled) {
          setSubSchemes([]);
          setSubscribe(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product?.databaseId]);

  // Reset state when product changes
  useEffect(() => {
    setQuantity(1);
    setSelectedVariation(null);
    setAddedToCart(false);
    setActiveImageIndex(0);
  }, [product?.id]);

  useEffect(() => {
    if (!product || typeof window === 'undefined') return;
    klaviyoTrack('Viewed Product', {
      ProductName: product.name,
      ProductID: product.databaseId,
      SKU: product.sku,
      Categories: product.productCategories?.nodes?.map((c) => c.name) ?? [],
      ImageURL: product.image?.sourceUrl,
      URL: window.location.href,
      Price: product.price,
    });
  }, [product?.id]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!product) {
    return (
      <Layout title="Product Not Found">
        <div className={styles.notFound}>
          <h1>Product Not Found</h1>
          <p>The product you are looking for does not exist.</p>
          <Link href="/shop" className="btn-primary">
            Continue Shopping
          </Link>
        </div>
      </Layout>
    );
  }

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      const variationId = selectedVariation ? parseInt(selectedVariation) : undefined;

      await addToCart({
        productId: product.databaseId,
        quantity,
        variationId,
      });
      try {
        const key = `mf_sub_${product.databaseId}`;
        if (subscribe && subChoice) {
          window.sessionStorage.setItem(
            key,
            JSON.stringify({ period: subChoice.period, interval: subChoice.interval })
          );
        } else {
          window.sessionStorage.removeItem(key);
        }
      } catch {
        void 0;
      }
      klaviyoTrack('Added to Cart', {
        ProductName: product.name,
        ProductID: product.databaseId,
        SKU: product.sku,
        Quantity: quantity,
        Price: product.price,
        Categories: product.productCategories?.nodes?.map((c) => c.name) ?? [],
      });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2500);
    } finally {
      setIsAdding(false);
    }
  };

  const primaryImage = product.image?.sourceUrl || '/placeholder-product.png';
  const galleryImages = product.galleryImages?.nodes || [];
  const allImages = [
    { sourceUrl: primaryImage, altText: product.image?.altText || product.name },
    ...galleryImages,
  ];

  const isInStock = !product.stockStatus || product.stockStatus === 'IN_STOCK';
  const hasVariations = product.variations?.nodes && product.variations.nodes.length > 0;
  const categories = product.productCategories?.nodes || [];

  // Get selected variation details
  const selectedVariationData = selectedVariation
    ? product.variations?.nodes.find((v) => v.databaseId.toString() === selectedVariation)
    : null;

  // Display price - use selected variation price if available
  const displayPrice = selectedVariationData?.price || product.price;
  const displaySalePrice = selectedVariationData?.salePrice || product.salePrice;
  const displayRegularPrice = selectedVariationData?.regularPrice || product.regularPrice;

  const seoPriceNumeric = String(displaySalePrice || displayPrice || displayRegularPrice || '').replace(/[^0-9.]/g, '');
  const seoDescription = (product.shortDescription || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  const productSchema = JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name,
    image: product.image?.sourceUrl ? [product.image.sourceUrl] : undefined,
    description: seoDescription || undefined,
    sku: product.sku || undefined,
    offers: seoPriceNumeric
      ? {
          '@type': 'Offer',
          price: seoPriceNumeric,
          priceCurrency: 'USD',
          availability: isInStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: SITE_URL ? `${SITE_URL}/product/${product.slug}` : undefined,
        }
      : undefined,
  });

  return (
    <Layout
      title={product.name}
      seo={{
        title: product.seo?.title,
        metaDesc: product.seo?.metaDesc,
        schema: product.seo?.schema?.raw,
        productSchema,
        opengraphTitle: product.seo?.opengraphTitle,
        opengraphDescription: product.seo?.opengraphDescription,
        opengraphImage: product.seo?.opengraphImage?.sourceUrl,
      }}
    >
      <div className={styles.page}>
        {/* Main Product Section */}
        <div className={styles.productLayout}>
          {/* Gallery */}
          <div className={styles.gallery}>
            {/* Main Image */}
            <div className={styles.mainImage}>
              <Image
                src={allImages[activeImageIndex]?.sourceUrl || primaryImage}
                alt={allImages[activeImageIndex]?.altText || product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className={styles.image}
                priority
              />

              {/* Sale Badge */}
              {product.salePrice && (
                <span className={styles.saleBadge}>Sale</span>
              )}
            </div>

            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className={styles.thumbnails}>
                {allImages.map((img, index) => (
                  <button
                    key={index}
                    className={`${styles.thumbnail} ${index === activeImageIndex ? styles.active : ''}`}
                    onClick={() => setActiveImageIndex(index)}
                    aria-label={`View image ${index + 1}`}
                  >
                    <Image
                      src={img.sourceUrl}
                      alt={img.altText || `${product.name} thumbnail ${index + 1}`}
                      fill
                      sizes="80px"
                      className={styles.thumbnailImage}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className={styles.info}>
            {/* Category */}
            {categories.length > 0 && (
              <Link href={`/shop?category=${categories[0].slug}`} className={styles.category}>
                {categories[0].name}
              </Link>
            )}

            {/* Breadcrumb */}
            <nav className={styles.breadcrumb}>
              <Link href="/">Home</Link>
              <span className={styles.separator}>/</span>
              <Link href="/shop">Shop</Link>
              {categories.length > 0 && (
                <>
                  <span className={styles.separator}>/</span>
                  <Link href={`/shop?category=${categories[0].slug}`}>{categories[0].name}</Link>
                </>
              )}
            </nav>

            {/* Title */}
            <h1 className={styles.title}>{product.name}</h1>

            {mounted && product.shopifyId && (
              <div
                className="klaviyo-star-rating-widget"
                data-id={product.shopifyId}
                data-product-title={product.name}
              />
            )}

            {/* Price */}
            <div className={styles.price}>
              {displaySalePrice ? (
                <>
                  <span className={styles.salePrice}>{displaySalePrice}</span>
                  <span className={styles.regularPrice}>{displayRegularPrice}</span>
                </>
              ) : (
                <span>{displayPrice}</span>
              )}
            </div>

            {/* Available Options */}
            {availableOptions.length > 1 && (
              <div className={styles.collectionItems}>
                <span className={styles.collectionLabel}>Available Options</span>
                <div className={styles.collectionGrid}>
                  {availableOptions.map((item) => (
                    <Link
                      key={item.id}
                      href={`/product/${item.slug}`}
                      className={`${styles.collectionItem} ${item.id === product.id ? styles.currentItem : ''}`}
                      title={item.name}
                    >
                      <div className={styles.collectionItemImageWrap}>
                        <Image
                          src={item.image?.sourceUrl || '/placeholder-product.png'}
                          alt={item.name}
                          fill
                          sizes="90px"
                          className={styles.collectionItemImage}
                        />
                      </div>
                      <span className={styles.collectionItemName}>
                        {optionLabel(item.name, availableOptionsBase)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Stock Status */}
            <div className={`${styles.stock} ${isInStock ? styles.inStock : styles.outOfStock}`}>
              <span className={styles.stockDot} />
              {isInStock ? 'In Stock' : 'Out of Stock'}
            </div>

            {/* Short Description */}
            {product.shortDescription && (
              <div
                className={styles.shortDescription}
                dangerouslySetInnerHTML={{ __html: product.shortDescription }}
              />
            )}

            {/* Variations */}
            {hasVariations && (
              <div className={styles.variations}>
                <span className={styles.variationLabel}>Select Option</span>
                <div className={styles.variationTiles}>
                  {product.variations!.nodes.map((variation) => {
                    const variationId = String(variation.databaseId);
                    const optionLabel =
                      variation.name?.replace(product.name, '').replace(/^\s*-\s*/, '').trim() ||
                      variation.name;
                    const isSelected = selectedVariation === variationId;
                    return (
                      <button
                        key={variation.databaseId}
                        type="button"
                        className={`${styles.variationTile} ${isSelected ? styles.variationTileActive : ''}`}
                        onClick={() => setSelectedVariation(variationId)}
                        aria-pressed={isSelected}
                      >
                        <span className={styles.variationTileName}>{optionLabel}</span>
                        <span className={styles.variationTilePrice}>{variation.price}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            {isInStock && (
              <div className={styles.quantitySelector}>
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className={styles.quantityBtn}
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className={styles.quantityValue}>{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className={styles.quantityBtn}
                  aria-label="Increase quantity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            )}

            {isInStock && subSchemes.length > 0 && (() => {
              const sel =
                (subChoice &&
                  subSchemes.find(
                    (s) => s.period === subChoice.period && s.interval === subChoice.interval
                  )) ||
                subSchemes[0];
              const discount = Math.round(sel.discount);
              return (
                <>
                <div className={styles.purchaseOptions}>
                  <button
                    type="button"
                    className={`${styles.purchaseOption} ${subscribe ? styles.purchaseOptionActive : ''}`}
                    onClick={() => setSubscribe(true)}
                    aria-pressed={subscribe}
                  >
                    <span className={styles.purchaseTop}>
                      <span className={styles.purchaseRadio} data-checked={subscribe} aria-hidden="true" />
                      <span className={styles.purchaseName}>Subscribe &amp; save</span>
                      <button
                        type="button"
                        className={styles.purchaseInfo}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSubInfo(true);
                        }}
                        aria-label="Why subscribe?"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path strokeLinecap="round" d="M12 11.5v4.5" />
                          <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
                        </svg>
                      </button>
                      {discount > 0 && (
                        <span className={styles.purchaseBadge}>Save up to {discount}%</span>
                      )}
                      <span className={styles.purchasePricing}>
                        <span className={styles.purchaseWas}>{product.price}</span>
                        <span className={styles.purchaseNow}>${sel.price}</span>
                      </span>
                    </span>
                    {subscribe && (
                      <span className={styles.purchaseDetail}>
                        <span className={styles.purchaseBenefits}>
                          {discount > 0 && (
                            <span className={styles.purchaseBenefit}>
                              <svg className={styles.purchaseBenefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.4 2.4 4.6-5" />
                              </svg>
                              Save {discount}%
                            </span>
                          )}
                          <span className={styles.purchaseBenefit}>
                            <svg className={styles.purchaseBenefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <circle cx="12" cy="12" r="9" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.4 2.4 4.6-5" />
                            </svg>
                            No commitment. Cancel anytime
                          </span>
                        </span>
                        <span className={styles.purchaseDeliver}>
                          <span className={styles.purchaseDeliverLabel}>Deliver every:</span>
                          <span className={styles.purchaseFreqs}>
                            {subSchemes.map((s) => {
                              const active = sel.period === s.period && sel.interval === s.interval;
                              return (
                                <button
                                  key={`${s.period}:${s.interval}`}
                                  type="button"
                                  className={`${styles.purchaseFreq} ${active ? styles.purchaseFreqActive : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSubChoice({ period: s.period, interval: s.interval });
                                  }}
                                  aria-pressed={active}
                                >
                                  <span className={styles.purchaseFreqLabel}>{formatEvery(s.period, s.interval)}</span>
                                  {s.discount > 0 && (
                                    <span className={styles.purchaseFreqSave}>save {Math.round(s.discount)}%</span>
                                  )}
                                </button>
                              );
                            })}
                          </span>
                        </span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`${styles.purchaseOption} ${!subscribe ? styles.purchaseOptionActive : ''}`}
                    onClick={() => setSubscribe(false)}
                    aria-pressed={!subscribe}
                  >
                    <span className={styles.purchaseTop}>
                      <span className={styles.purchaseRadio} data-checked={!subscribe} aria-hidden="true" />
                      <span className={styles.purchaseName}>One-time</span>
                      <span className={styles.purchasePricing}>
                        <span className={styles.purchaseNow}>{product.price}</span>
                      </span>
                    </span>
                  </button>
                </div>
                {showSubInfo && (
                  <div
                    className={styles.subInfoOverlay}
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setShowSubInfo(false)}
                  >
                    <div className={styles.subInfoModal} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.subInfoClose}
                        onClick={() => setShowSubInfo(false)}
                        aria-label="Close"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                      <h3 className={styles.subInfoTitle}>Great reasons to subscribe</h3>
                      <ul className={styles.subInfoList}>
                        <li className={styles.subInfoItem}>
                          <span className={styles.subInfoIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                              <rect x="4" y="5" width="16" height="16" rx="2" />
                              <path strokeLinecap="round" d="M4 9.5h16M8.5 3v4M15.5 3v4" />
                            </svg>
                          </span>
                          <span className={styles.subInfoText}>
                            <strong>Flexible frequency</strong>
                            {' Not sure how much of something you need, or how often? Adjust quantities and frequencies any time.'}
                          </span>
                        </li>
                        <li className={styles.subInfoItem}>
                          <span className={styles.subInfoIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18 8.5a6 6 0 10-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5" />
                              <path strokeLinecap="round" d="M13.6 20.5a1.9 1.9 0 01-3.2 0" />
                            </svg>
                          </span>
                          <span className={styles.subInfoText}>
                            <strong>Order reminders</strong>
                            {" We'll let you know before each shipment. Delay, reschedule or cancel if you need to, we'll only bill you when your order ships."}
                          </span>
                        </li>
                        <li className={styles.subInfoItem}>
                          <span className={styles.subInfoIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5h9" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2 2 0 012.9 2.9L7.5 18.7 3.5 20l1.3-4z" />
                            </svg>
                          </span>
                          <span className={styles.subInfoText}>
                            <strong>You&apos;re in control</strong>
                            {' Add or remove subscriptions, cancel orders, and edit frequencies and quantities through our user-friendly customer portal.'}
                          </span>
                        </li>
                      </ul>
                      <button
                        type="button"
                        className={styles.subInfoBtn}
                        onClick={() => setShowSubInfo(false)}
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                )}
                </>
              );
            })()}

            <p className={styles.shippingNote}>
              <a href="/shipping-policy">Shipping</a> calculated at checkout.
            </p>

            {/* Add to Cart Section */}
            {isInStock ? (
              <div className={styles.addToCartSection}>
                {/* Add to Cart Button */}
                <button
                  className={`button is-black is-fullwidth ${isAdding ? 'loading' : ''}`}
                  onClick={handleAddToCart}
                  disabled={isAdding || (hasVariations && !selectedVariation)}
                >
                  {isAdding ? (
                    <span className={styles.btnContent}>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding...
                    </span>
                  ) : addedToCart ? (
                    <span className={styles.btnContent}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Added to Cart!
                    </span>
                  ) : (
                    'Add to Cart'
                  )}
                </button>
              </div>
            ) : (
              <div className={styles.soldOut}>
                <span>Currently Unavailable</span>
                <p>This item is out of stock. Check back soon!</p>
              </div>
            )}

            <FrequentlyBoughtTogether
              productId={product.databaseId}
              productSlug={product.slug}
              productName={product.name}
              productPrice={product.price || ''}
              productRegularPrice={product.regularPrice}
              productImage={product.image}
              productTypeLabel={product.mfproductTypes?.nodes?.[0]?.name}
              productSubtitle={
                product.productLines?.nodes?.[0]?.name ||
                (
                  (product as { cannabinoids?: { nodes: Array<{ name: string }> } }).cannabinoids
                    ?.nodes || []
                )
                  .map((c) => c.name)
                  .join(' + ') ||
                undefined
              }
              typeSlugs={(product.mfproductTypes?.nodes || [])
                .map((t) => (t as { slug?: string }).slug || '')
                .filter(Boolean)}
            />

            {/* Product Meta */}
            <div className={styles.meta}>
              {categories.length > 0 && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Category</span>
                  <div className={styles.metaLinks}>
                    {categories.map((cat, index) => (
                      <span key={cat.id}>
                        <Link href={`/shop?category=${cat.slug}`}>{cat.name}</Link>
                        {index < categories.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {collectionName && collectionSlug && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Collection</span>
                  <Link href={`/collection/${collectionSlug}`} className={styles.metaLink}>
                    {collectionName}
                  </Link>
                </div>
              )}
            </div>

            {/* Full Description */}
            <div className={styles.descriptionSection}>
              {product.description && (
                <div
                  className={styles.description}
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              )}
              <PdpTrustBadges />
              {product.productDetails?.coaLink && (
                <a
                  href={product.productDetails.coaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.coaButton}
                >
                  See Test Results
                </a>
              )}
            </div>
          </div>
        </div>

        <ProductFaqs details={product.productDetails} noidName={product.blendTypes?.nodes?.[0]?.name} />

        {mounted && product.shopifyId && (
          <div className={`${styles.descriptionSection} ${styles.reviewsSection}`}>
            <div id="klaviyo-reviews-all" data-id={product.shopifyId} />
          </div>
        )}

        <YouMayAlsoLike
          productId={product.databaseId}
          productSlug={product.slug}
          productPrice={product.price || ''}
          typeSlugs={(product.mfproductTypes?.nodes || [])
            .map((t) => (t as { slug?: string }).slug || '')
            .filter(Boolean)}
        />

        <RecentlyViewed currentSlug={product.slug} />

      </div>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_ALL_PRODUCT_SLUGS,
    });

    const paths = data?.products?.nodes?.map((product: { slug: string }) => ({
      params: { slug: product.slug },
    })) || [];

    return {
      paths,
      fallback: 'blocking',
    };
  } catch (error) {
    console.error('Error fetching product slugs:', error);
    return {
      paths: [],
      fallback: 'blocking',
    };
  }
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_PRODUCT_BY_SLUG,
      variables: { slug: params?.slug },
    });

    if (!data?.product) {
      return { notFound: true };
    }

    const product = data.product;
    let collectionName: string | null = null;
    let collectionSlug: string | null = null;

    if (product.collections?.nodes && product.collections.nodes.length > 0) {
      const firstCollection = product.collections.nodes[0];
      collectionName = firstCollection.name;
      collectionSlug = firstCollection.slug;
    }

    let availableOptions: Product[] = [];
    let availableOptionsBase = '';
    const nameParts = (product.name || '').split(' - ').map((s: string) => s.trim());
    if (nameParts.length >= 3) {
      availableOptionsBase = nameParts.slice(1, -1).join(' - ');
    } else if (nameParts.length === 2) {
      availableOptionsBase = nameParts[0];
    }
    const productWords = new Set(
      (product.name || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map((w: string) => w.replace(/s$/, ''))
    );
    const collections = (product.collections?.nodes || []) as Array<{ slug?: string; count?: number }>;
    let bestSlug = '';
    let bestScore = -1;
    let bestCount = Infinity;
    for (const col of collections) {
      const count = col.count ?? 0;
      if (!col.slug || count < 2 || count > 40) continue;
      const score = col.slug
        .split('-')
        .filter(Boolean)
        .reduce((acc: number, w: string) => (productWords.has(w.replace(/s$/, '')) ? acc + 1 : acc), 0);
      if (score > bestScore || (score === bestScore && count < bestCount)) {
        bestScore = score;
        bestCount = count;
        bestSlug = col.slug;
      }
    }

    if (bestSlug && bestScore >= 2) {
      try {
        const { data: colData } = await client.query({
          query: GET_PRODUCTS_BY_COLLECTION,
          variables: { collectionFilter: bestSlug, first: 40 },
        });
        const siblings = (colData?.products?.nodes || []).filter((p: Product) => p?.databaseId);
        if (siblings.length > 1) {
          availableOptions = siblings;
        }
      } catch (colError) {
        console.error('Error fetching available options:', colError);
      }
    }

    return {
      props: {
        product,
        collectionName,
        collectionSlug,
        availableOptions,
        availableOptionsBase,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching product:', error);
    return { notFound: true };
  }
};
