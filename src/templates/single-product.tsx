"use client";

import { FaustTemplateProps } from '@faustwp/core';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { GET_PRODUCT_BY_DATABASE_ID } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import FrequentlyBoughtTogether from '@/components/pdp/FrequentlyBoughtTogether';
import ProductDescription from '@/components/pdp/ProductDescription';
import ProductReviews from '@/components/pdp/ProductReviews';
import ShippingReturns from '@/components/pdp/ShippingReturns';
import FreeShippingTracker from '@/components/pdp/FreeShippingTracker';
import ProductRating from '@/components/pdp/ProductRating';
import type { KlaviyoReviewsResult } from '@/lib/klaviyo-reviews';
import ProductTimeline from '@/components/pdp/ProductTimeline';
import ProductSnapshot from '@/components/pdp/ProductSnapshot';
import FlavorsBox from '@/components/pdp/FlavorsBox';
import AvailableOptions from '@/components/pdp/AvailableOptions';
import Breadcrumb from '@/components/Breadcrumb';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import { useCart } from '@/context/CartContext';
import { klaviyoTrack } from '@/lib/klaviyo';
import { Product, ProductNutrition, ProductTaxonomies } from '@/types/woocommerce';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Thumbs, Pagination, FreeMode, Mousewheel } from 'swiper/modules';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/free-mode';
import 'swiper/css/thumbs';

const YouMayAlsoLike = dynamic(() => import('@/components/pdp/YouMayAlsoLike'), { ssr: false });

const RAW_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const SITE_URL = RAW_SITE_URL && !/^https?:\/\//i.test(RAW_SITE_URL) ? `https://${RAW_SITE_URL}` : RAW_SITE_URL;

/** Core product data, resolved from WPGraphQL via `SingleProduct.query`. */
interface SingleProductData {
  product: Product | null;
}

export interface FixedBundleItemEntry {
  productId: number;
  quantity: number;
  product?: Product;
}

/**
 * Derived data that only the `mf/v1/product` REST endpoint produces — sibling
 * option grouping, collection lookup and bundle resolution are all computed in
 * PHP, so they're fetched alongside the seed query and passed through as extra
 * props by the `/products/[slug]` route.
 */
export interface SingleProductExtras {
  collectionName: string | null;
  collectionSlug: string | null;
  availableOptions: Product[];
  availableOptionsBase: string;
  nutrition: ProductNutrition | null;
  topCannabinoids: string[];
  allergens: string | null;
  taxonomies: ProductTaxonomies;
  reviewData: KlaviyoReviewsResult;
  // Fixed bundles' admin-picked items (bbFixedItems), pre-resolved into full
  // product records server-side so "What's included" renders immediately
  // instead of waiting on a client-side follow-up fetch.
  fixedBundleItems: FixedBundleItemEntry[];
}

type SingleProductProps = FaustTemplateProps<SingleProductData, SingleProductExtras>;

function formatEvery(period: string, interval: number) {
  return interval > 1 ? `${interval} ${period}s` : `1 ${period}`;
}

const SingleProduct: React.FC<SingleProductProps> & {
  query?: typeof GET_PRODUCT_BY_DATABASE_ID;
  variables?: (seedNode: { databaseId?: number | string | null }) => { databaseId: string };
} = ({
  data,
  collectionName = null,
  collectionSlug = null,
  availableOptions = [],
  availableOptionsBase = '',
  nutrition = null,
  topCannabinoids = [],
  allergens = null,
  taxonomies = {},
  reviewData = null,
  fixedBundleItems: initialFixedBundleItems = [],
}) => {
  const product = data?.product as Product | undefined;
  const [quantity, setQuantity] = useState(1);
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [bundleAddError, setBundleAddError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [subSchemes, setSubSchemes] = useState<
    Array<{ period: string; interval: number; price: string; discount: number }>
  >([]);
  const [subscribe, setSubscribe] = useState(false);
  const [subChoice, setSubChoice] = useState<{ period: string; interval: number } | null>(null);
  const [showSubInfo, setShowSubInfo] = useState(false);
  const { addToCart, addFixedBundleToCart } = useCart();
  const [fixedBundleItems, setFixedBundleItems] = useState<FixedBundleItemEntry[]>(initialFixedBundleItems);

   // Store the thumbs swiper instance to connect it to the main slider
  const [thumbsSwiper, setThumbsSwiper] = useState<any>(null);

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
      bbBundleMode: product.bbBundleMode,
      bbFixedPrice: product.bbFixedPrice,
      bbFixedOriginalPrice: product.bbFixedOriginalPrice,
      bbFromPrice: product.bbFromPrice,
      bbShowPrice: product.bbShowPrice,
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

  // Fixed bundles have no picker — resolve the admin-picked bbFixedItems
  // (productId + quantity only) into full product records for display.
  // `initialFixedBundleItems` (server-resolved in getStaticProps) already
  // covers the common case — skip the client round trip whenever it already
  // matches this product's items, so "What's included" doesn't pop in late.
  useEffect(() => {
    const items = product?.bbFixedItems;
    if (product?.bbBundleMode !== 'fixed' || !items || items.length === 0) {
      setFixedBundleItems([]);
      return;
    }
    const hasServerData =
      initialFixedBundleItems.length === items.length &&
      initialFixedBundleItems.every((entry) => items.some((i) => i.productId === entry.productId));
    if (hasServerData) {
      setFixedBundleItems(initialFixedBundleItems);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = items.map((i) => i.productId);
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            query: /* GraphQL */ `query GetFixedBundleItems($ids: [Int]!) {
              products(first: 100, where: { include: $ids }) {
                nodes {
                  __typename
                  ... on SimpleProduct { databaseId name slug price regularPrice image { sourceUrl altText } }
                  ... on VariableProduct { databaseId name slug price regularPrice image { sourceUrl altText } }
                }
              }
            }`,
            variables: { ids },
          }),
        });
        const json = await res.json();
        const nodes: Product[] = json?.data?.products?.nodes || [];
        if (cancelled) return;
        const byId = new Map(nodes.map((p) => [p.databaseId, p]));
        setFixedBundleItems(items.map((item) => ({ ...item, product: byId.get(item.productId) })));
      } catch {
        if (!cancelled) setFixedBundleItems(items.map((item) => ({ ...item })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product?.databaseId, product?.bbBundleMode, initialFixedBundleItems]);

  // Reset state when product changes. "mystery" prices/qty-limits like "fixed".
  useEffect(() => {
    const isFixedLikeBundle = product?.bbBundleMode === 'fixed' || product?.bbBundleMode === 'mystery';
    setQuantity(isFixedLikeBundle ? product?.bbFixedQtyMin || 1 : 1);
    setSelectedVariation(null);
    setAddedToCart(false);
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
        <div className="not-found">
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

  const handleFixedBundleAddToCart = async () => {
    setIsAdding(true);
    setBundleAddError(null);
    try {
      await addFixedBundleToCart(product.databaseId, quantity, product.name, product.image);
      klaviyoTrack('Added to Cart', {
        ProductName: product.name,
        ProductID: product.databaseId,
        SKU: product.sku,
        Quantity: quantity,
        Price: product.bbFixedPrice,
        Categories: product.productCategories?.nodes?.map((c) => c.name) ?? [],
      });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2500);
    } catch (err) {
      setBundleAddError(err instanceof Error ? err.message : 'Could not add this bundle to your cart.');
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
  // Bundle Builder entry-point product. "byob" has no fixed price and can't
  // be added to cart directly — "Create Bundle" routes into the picker page.
  // "fixed" is a normal add-to-cart with a flat price and a read-only,
  // admin-picked set of items (fixedBundleItems, resolved above). "mystery"
  // renders identically, but fixedBundleItems stays empty (bbFixedItems is
  // gated to null for customer requests).
  const isByobBundle = product.bbBundleMode === 'byob';
  const isFixedBundle = product.bbBundleMode === 'fixed' || product.bbBundleMode === 'mystery';
  const isBundle = isByobBundle || isFixedBundle;
  const categories = product.productCategories?.nodes || [];

  // Original (undiscounted) price for one fixed-bundle set — prefer the
  // server-computed bbFixedOriginalPrice; fall back to summing the resolved
  // items' own regular prices if that field isn't populated. Shown struck
  // through next to bbFixedPrice whenever it's actually a discount off that.
  const fixedItemsOriginalSum = fixedBundleItems.reduce((sum, item) => {
    const unit = parseFloat(
      (item.product?.regularPrice || item.product?.price || '0').replace(/[^0-9.]/g, '')
    ) || 0;
    return sum + unit * item.quantity;
  }, 0);
  const fixedOriginalPricePerSet = product.bbFixedOriginalPrice ?? fixedItemsOriginalSum;

  // Get selected variation details
  const selectedVariationData = selectedVariation
    ? product.variations?.nodes.find((v) => v.databaseId.toString() === selectedVariation)
    : null;

  // Display price - use selected variation price if available
  const displayPrice = selectedVariationData?.price || product.price;
  const displaySalePrice = selectedVariationData?.salePrice || product.salePrice;
  const displayRegularPrice = selectedVariationData?.regularPrice || product.regularPrice;

  const scalePrice = (price?: string) => {
    if (!price || quantity <= 1) return price;
    const nums = price.match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length !== 1) return price;
    return price.replace(nums[0], (parseFloat(nums[0]) * quantity).toFixed(2));
  };

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
          url: SITE_URL ? `${SITE_URL}/products/${product.slug}` : undefined,
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
      <div className="container">
        <Breadcrumb product={product} />

        <div className="columns is-8-desktop product-layout">
          <div className="column">
            <div className="gallery">
              <Swiper
                modules={[Thumbs, Pagination, Mousewheel]}
                spaceBetween={10}
                pagination={{
                  clickable: true,
                  el: '.pagination-dots', // Targeted container for mobile dots
                }}
                thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                mousewheel={{ enabled: true, forceToAxis: true, thresholdDelta: 10 }}
                className="main-images"
              >
                {allImages.map((img, index) => (
                  <SwiperSlide key={index}>
                    <img
                      src={img.sourceUrl}
                      alt={`Slide ${index + 1}`}
                      className="main-image"
                    />
                  </SwiperSlide>
                ))}
              </Swiper>

              <div className="pagination-dots swiper-pagination" />
              
              <div className="thumbnails">
                <Swiper
                  onSwiper={setThumbsSwiper}
                  spaceBetween={10}
                  slidesPerView={4} // Number of thumbs visible at once before overflowing
                  freeMode={true}
                  watchSlidesProgress={true}
                  mousewheel={{ enabled: true, forceToAxis: true, thresholdDelta: 5 }}
                  modules={[FreeMode, Thumbs, Mousewheel]}
                >
                  {allImages.map((img, index) => (
                    <SwiperSlide key={index} className="cursor-pointer opacity-40 [&.swiper-slide-thumb-active]:opacity-100">
                      <div className="thumbnail">
                        <img
                          src={img.sourceUrl}
                          alt={`Thumb ${index + 1}`}
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
            </div>
            
            <div className="purchase-block">
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
                  <div className="purchase-options">
                    <button
                      type="button"
                      className={`purchase-option ${subscribe ? 'purchase-option-active' : ''}`}
                      onClick={() => setSubscribe(true)}
                      aria-pressed={subscribe}
                    >
                      <span className="purchase-top">
                        <span className="purchase-radio" data-checked={subscribe} aria-hidden="true" />
                        <span className="purchase-name">Subscribe &amp; save</span>
                        <button
                          type="button"
                          className="purchase-info"
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
                          <span className="purchase-badge">Save up to {discount}%</span>
                        )}
                        <span className="purchase-pricing">
                          <span className="purchase-was">{product.price}</span>
                          <span className="purchase-now">${sel.price}</span>
                        </span>
                      </span>
                      {subscribe && (
                        <span className="purchase-detail">
                          <span className="purchase-benefits">
                            {discount > 0 && (
                              <span className="purchase-benefit">
                                <svg className="purchase-benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                  <circle cx="12" cy="12" r="9" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.4 2.4 4.6-5" />
                                </svg>
                                Save {discount}%
                              </span>
                            )}
                            <span className="purchase-benefit">
                              <svg className="purchase-benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.4 2.4 4.6-5" />
                              </svg>
                              No commitment. Cancel anytime
                            </span>
                          </span>
                          <span className="purchase-deliver">
                            <span className="purchase-deliver-label">Deliver every:</span>
                            <span className="purchase-freqs">
                              {subSchemes.map((s) => {
                                const active = sel.period === s.period && sel.interval === s.interval;
                                return (
                                  <button
                                    key={`${s.period}:${s.interval}`}
                                    type="button"
                                    className={`purchase-freq ${active ? 'purchase-freq-active' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSubChoice({ period: s.period, interval: s.interval });
                                    }}
                                    aria-pressed={active}
                                  >
                                    <span className="purchase-freq-label">{formatEvery(s.period, s.interval)}</span>
                                    {s.discount > 0 && (
                                      <span className="purchase-freq-save">save {Math.round(s.discount)}%</span>
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
                      className={`purchase-option ${!subscribe ? 'purchase-option-active' : ''}`}
                      onClick={() => setSubscribe(false)}
                      aria-pressed={!subscribe}
                    >
                      <span className="purchase-top">
                        <span className="purchase-radio" data-checked={!subscribe} aria-hidden="true" />
                        <span className="purchase-name">One-time</span>
                        <span className="purchase-pricing">
                          <span className="purchase-now">{product.price}</span>
                        </span>
                      </span>
                    </button>
                  </div>
                  {showSubInfo && (
                    <div
                      className="sub-info-overlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={() => setShowSubInfo(false)}
                    >
                      <div className="sub-info-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="sub-info-close"
                          onClick={() => setShowSubInfo(false)}
                          aria-label="Close"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                        <h3 className="sub-info-title">Great reasons to subscribe</h3>
                        <ul className="sub-info-list">
                          <li className="sub-info-item">
                            <span className="sub-info-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                <rect x="4" y="5" width="16" height="16" rx="2" />
                                <path strokeLinecap="round" d="M4 9.5h16M8.5 3v4M15.5 3v4" />
                              </svg>
                            </span>
                            <span className="sub-info-text">
                              <strong>Flexible frequency</strong>
                              {' Not sure how much of something you need, or how often? Adjust quantities and frequencies any time.'}
                            </span>
                          </li>
                          <li className="sub-info-item">
                            <span className="sub-info-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 8.5a6 6 0 10-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5" />
                                <path strokeLinecap="round" d="M13.6 20.5a1.9 1.9 0 01-3.2 0" />
                              </svg>
                            </span>
                            <span className="sub-info-text">
                              <strong>Order reminders</strong>
                              {" We'll let you know before each shipment. Delay, reschedule or cancel if you need to, we'll only bill you when your order ships."}
                            </span>
                          </li>
                          <li className="sub-info-item">
                            <span className="sub-info-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5h9" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2 2 0 012.9 2.9L7.5 18.7 3.5 20l1.3-4z" />
                              </svg>
                            </span>
                            <span className="sub-info-text">
                              <strong>You&apos;re in control</strong>
                              {' Add or remove subscriptions, cancel orders, and edit frequencies and quantities through our user-friendly customer portal.'}
                            </span>
                          </li>
                        </ul>
                        <button
                          type="button"
                          className="sub-info-btn"
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

              {/* Add to Cart Section */}
              {isInStock ? (
                isByobBundle ? (
                  <div className="add-to-cart-section">
                    {/* byob bundles are priced/added via the bundle builder,
                        not a direct add-to-cart — this routes into that flow.
                        Same slug as this product, just under /bundle/. */}
                    <Link
                      href={`/bundle/${product.slug}`}
                      className="button is-black is-fullwidth"
                    >
                      Create Bundle
                    </Link>
                  </div>
                ) : isFixedBundle ? (
                  <>
                  <div className="add-to-cart-section">
                    {/* Fixed bundle: the item set is already decided, so this
                        is just a normal add-to-cart with a bounded quantity
                        (number of bundle sets, not individual items). */}
                    <div className="quantity-selector">
                      <label>Quantity</label>
                      <button
                        onClick={() => {
                          setBundleAddError(null);
                          setQuantity(Math.max(product.bbFixedQtyMin || 1, quantity - 1));
                        }}
                        className="quantity-btn decrease"
                        aria-label="Decrease quantity"
                        disabled={quantity <= (product.bbFixedQtyMin || 1)}
                      >
                        −
                      </button>
                      <span className="quantity-value">{quantity}</span>
                      <button
                        onClick={() => {
                          setBundleAddError(null);
                          setQuantity(
                            product.bbFixedQtyMax != null
                              ? Math.min(product.bbFixedQtyMax, quantity + 1)
                              : quantity + 1
                          );
                        }}
                        className="quantity-btn increase"
                        aria-label="Increase quantity"
                        disabled={product.bbFixedQtyMax != null && quantity >= product.bbFixedQtyMax}
                      >
                        +
                      </button>
                    </div>

                    <button
                      className={`add-to-cart button is-fullwidth ${isAdding ? 'loading' : ''}`}
                      onClick={handleFixedBundleAddToCart}
                      disabled={isAdding}
                    >
                      {isAdding ? (
                        <span className="btn-content">
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Adding...
                        </span>
                      ) : addedToCart ? (
                        <span className="btn-content">
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
                  {bundleAddError && (
                    <div className="bundle-add-error" role="alert">
                      {bundleAddError}
                    </div>
                  )}
                  </>
                ) : (
                <div className="add-to-cart-section">
                  {/* Quantity Selector */}
                  <div className="quantity-selector">
                    <label>
                      Quantity
                    </label>
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="quantity-btn decrease"
                      aria-label="Decrease quantity"
                      disabled={quantity <= 1}
                    >
                      −
                    </button>
                    <span className="quantity-value">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="quantity-btn increase"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  {/* Add to Cart Button */}
                  <button
                    className={`add-to-cart button is-fullwidth ${isAdding ? 'loading' : ''}`}
                    onClick={handleAddToCart}
                    disabled={isAdding || (hasVariations && !selectedVariation)}
                  >
                    {isAdding ? (
                      <span className="btn-content">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Adding...
                      </span>
                    ) : addedToCart ? (
                      <span className="btn-content">
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
                )
              ) : (
                <div className="sold-out">
                  <span>Currently Unavailable</span>
                  <p>This item is out of stock. Check back soon!</p>
                </div>
              )}

              <p className="shipping-note">
                <a href="/shipping-policy">Shipping</a> calculated at checkout.
              </p>

              <ShippingReturns />
            </div>
          </div>

          <div className="column">
            <h1 className="title">
              {product.name}
            </h1>

            <ProductRating
              average={reviewData?.summary?.average ?? 0}
              total={reviewData?.summary?.total ?? 0}
            />

            <div className="divider is-hidden is-block-tablet"></div>

            {/* Price — byob bundles have no fixed price (they're priced by
                selection) so show a "starting from" price; fixed bundles
                have one flat price for the whole set, scaled by quantity
                like a normal product. */}
            {isFixedBundle ? (
              product.bbFixedPrice != null && (
                <div className="price">
                  {fixedOriginalPricePerSet > product.bbFixedPrice + 0.005 ? (
                    <>
                      <span className="sale-price">${(product.bbFixedPrice * quantity).toFixed(2)}</span>
                      <span className="regular-price">${(fixedOriginalPricePerSet * quantity).toFixed(2)}</span>
                    </>
                  ) : (
                    <span>${(product.bbFixedPrice * quantity).toFixed(2)}</span>
                  )}
                </div>
              )
            ) : isByobBundle ? (
              product.bbShowPrice && product.bbFromPrice != null && (
                <div className="price">
                  <span>From ${product.bbFromPrice.toFixed(2)}</span>
                </div>
              )
            ) : (
              <div className="price">
                {displaySalePrice ? (
                  <>
                    <span className="sale-price">{scalePrice(displaySalePrice)}</span>
                    <span className="regular-price">{scalePrice(displayRegularPrice)}</span>
                  </>
                ) : (
                  <span>{scalePrice(displayPrice)}</span>
                )}
              </div>
            )}
            
            <FreeShippingTracker />

            <div className="divider is-hidden is-block-tablet"></div>

            {/* Fixed bundle contents — read-only, the admin already picked
                these; there's nothing for the shopper to select. Shown above
                Available Options so shoppers see what's in the box first. */}
            {isFixedBundle && fixedBundleItems.length > 0 && (
              <div className="fixed-bundle-items">
                <span className="fixed-bundle-items-label">What&apos;s included</span>
                <ul className="fixed-bundle-items-list">
                  {fixedBundleItems.map(({ productId, quantity: itemQty, product: itemProduct }) => (
                    <li key={productId} className="fixed-bundle-item">
                      <div className="fixed-bundle-item-image">
                        {itemProduct?.image?.sourceUrl && (
                          <img
                            src={itemProduct.image.sourceUrl}
                            alt={itemProduct.image.altText || itemProduct.name}
                          />
                        )}
                      </div>
                      <span className="fixed-bundle-item-name">
                        {itemProduct?.name || `Product #${productId}`}
                      </span>
                      <span className="fixed-bundle-item-qty">×{itemQty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="divider is-hidden is-block-tablet"></div>

            <AvailableOptions
              options={availableOptions}
              currentProductId={product.id}
              baseName={availableOptionsBase}
            />

            {/* Stock Status */}
            {/* <div className={`stock ${isInStock ? 'in-stock' : 'out-of-stock'}`}>
              <span className="stock-dot" />
              {isInStock ? 'In Stock' : 'Out of Stock'}
            </div> */}

            {/* Short Description */}
            {product.shortDescription && (
              <div
                className="short-description"
                dangerouslySetInnerHTML={{ __html: product.shortDescription }}
              />
            )}

            {/* Variations */}
            {hasVariations && (
              <div className="variations">
                <span className="variation-label">Select Option</span>
                <div className="variation-tiles">
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
                        className={`variation-tile ${isSelected ? 'variation-tile-active' : ''}`}
                        onClick={() => setSelectedVariation(variationId)}
                        aria-pressed={isSelected}
                      >
                        <span className="variation-tile-name">{optionLabel}</span>
                        <span className="variation-tile-price">{variation.price}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}


            <ProductSnapshot
              nutrition={nutrition}
              mG={product.mG}
              size={product.size}
              pieces={product.pieces}
              topCannabinoids={topCannabinoids}
              productTypes={product.mfproductTypes}
            />

            {!isByobBundle && (
              <FrequentlyBoughtTogether
                productId={product.databaseId}
                productSlug={product.slug}
                productPrice={product.price || ''}
                typeSlugs={(product.mfproductTypes?.nodes || [])
                  .map((t) => (t as { slug?: string }).slug || '')
                  .filter(Boolean)}
              />
            )}

            {!isBundle && <FlavorsBox product={product} taxonomies={taxonomies} />}
            <ProductTimeline product={product} />
          </div>
        </div>

        <ProductDescription product={product} nutrition={nutrition} allergens={allergens} />

        <ProductReviews summary={reviewData?.summary} reviews={reviewData?.reviews || []} />

        {mounted && product.shopifyId && (
          <div className="description-section reviews-section">
            <div id="klaviyo-reviews-all" data-id={product.shopifyId} />
          </div>
        )}

        <div className="pdp-recommendations">
          <YouMayAlsoLike
            source={{
              kind: 'recommendations',
              productId: product.databaseId,
              productSlug: product.slug,
              productPrice: product.price || '',
              typeSlugs: (product.mfproductTypes?.nodes || [])
                .map((t) => (t as { slug?: string }).slug || '')
                .filter(Boolean),
            }}
          />
        </div>
      </div>
    </Layout>
  );
};

SingleProduct.query = GET_PRODUCT_BY_DATABASE_ID;

// Faust resolves the seed node from the URI; the template query is keyed off its
// database ID.
SingleProduct.variables = (seedNode) => ({
  databaseId: String(seedNode?.databaseId ?? ''),
});

export default SingleProduct;
