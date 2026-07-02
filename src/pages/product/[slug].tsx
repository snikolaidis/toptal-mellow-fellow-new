import { GetStaticProps, GetStaticPaths } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCT_BY_SLUG, GET_ALL_PRODUCT_SLUGS } from '@/graphql/queries/products';
import { GET_COLLECTION_BY_SLUG } from '@/graphql/queries/collections';
import Layout from '@/components/Layout';
import { useCart } from '@/context/CartContext';
import { klaviyoTrack } from '@/lib/klaviyo';
import { Product, Collection } from '@/types/woocommerce';
import styles from '@/styles/pages/product.module.css';

interface ProductPageProps {
  product: Product;
  collectionProducts: Product[];
  collectionName: string | null;
  collectionSlug: string | null;
}

function formatEvery(period: string, interval: number) {
  return interval > 1 ? `${interval} ${period}s` : period;
}

export default function ProductPage({
  product,
  collectionProducts,
  collectionName,
  collectionSlug,
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
  const [subscribe, setSubscribe] = useState(true);
  const [subChoice, setSubChoice] = useState<{ period: string; interval: number } | null>(null);
  const { addToCart } = useCart();

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
          setSubscribe(true);
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

  return (
    <Layout
      title={product.name}
      seo={{
        title: product.seo?.title,
        metaDesc: product.seo?.metaDesc,
        schema: product.seo?.schema?.raw,
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

            {/* Collection Items Grid */}
            {collectionProducts.length > 1 && collectionName && (
              <div className={styles.collectionItems}>
                <span className={styles.collectionLabel}>Available Options</span>
                <div className={styles.collectionGrid}>
                  {collectionProducts.map((item) => (
                    <Link
                      key={item.id}
                      href={`/product/${item.slug}`}
                      className={`${styles.collectionItem} ${item.id === product.id ? styles.currentItem : ''}`}
                      title={item.name}
                    >
                      <Image
                        src={item.image?.sourceUrl || '/placeholder-product.png'}
                        alt={item.name}
                        fill
                        sizes="80px"
                        className={styles.collectionItemImage}
                      />
                    </Link>
                  ))}
                </div>
              </div>
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
                <label htmlFor="variation-select" className={styles.variationLabel}>
                  Select Option
                </label>
                <select
                  id="variation-select"
                  value={selectedVariation || ''}
                  onChange={(e) => setSelectedVariation(e.target.value)}
                  className={styles.variationSelect}
                >
                  <option value="">Choose an option</option>
                  {product.variations!.nodes.map((variation) => (
                    <option key={variation.databaseId} value={variation.databaseId}>
                      {variation.name} - {variation.price}
                    </option>
                  ))}
                </select>
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
                          {discount > 0 && <span>Save {discount}%</span>}
                          <span>No commitment. Cancel anytime</span>
                        </span>
                        <span className={styles.purchaseDeliver}>
                          <span className={styles.purchaseDeliverLabel}>Deliver every</span>
                          <select
                            className={styles.purchaseDeliverSelect}
                            value={`${sel.period}:${sel.interval}`}
                            onChange={(e) => {
                              const [period, interval] = e.target.value.split(':');
                              setSubChoice({ period, interval: Number(interval) });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {subSchemes.map((s) => (
                              <option
                                key={`${s.period}:${s.interval}`}
                                value={`${s.period}:${s.interval}`}
                              >
                                {formatEvery(s.period, s.interval)}
                                {s.discount > 0 ? ` (save ${Math.round(s.discount)}%)` : ''}
                              </option>
                            ))}
                          </select>
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
              );
            })()}

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
            {product.description && (
              <div className={styles.descriptionSection}>
                <div
                  className={styles.description}
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Full Description */}
        {product.description && (
          <div className={styles.descriptionSection}>
            <h2 className={styles.sectionTitle}>Product Details</h2>
            <div
              className={styles.description}
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        )}

        {mounted && product.shopifyId && (
          <div className={styles.descriptionSection}>
            <div id="klaviyo-reviews-all" data-id={product.shopifyId} />
          </div>
        )}

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
    let collectionProducts: Product[] = [];
    let collectionName: string | null = null;
    let collectionSlug: string | null = null;

    // Fetch products from the first collection if product has collections
    if (product.collections?.nodes && product.collections.nodes.length > 0) {
      const firstCollection = product.collections.nodes[0];
      collectionName = firstCollection.name;
      collectionSlug = firstCollection.slug;

      try {
        const { data: collectionData } = await client.query({
          query: GET_COLLECTION_BY_SLUG,
          variables: { slug: firstCollection.slug },
        });

        if (collectionData?.collection?.products?.nodes) {
          collectionProducts = collectionData.collection.products.nodes;
        }
      } catch (collectionError) {
        console.error('Error fetching collection products:', collectionError);
      }
    }

    return {
      props: {
        product,
        collectionProducts,
        collectionName,
        collectionSlug,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching product:', error);
    return { notFound: true };
  }
};
