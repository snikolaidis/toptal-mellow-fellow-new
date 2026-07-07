import { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Mousewheel } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';

/**
 * Migrated from the Shopify "Collection Group" section (collection-group.liquid
 * + collection-group__divs / collection-group__slides snippets + the
 * <collection-group> custom element). Renders a row of collection "tabs"
 * (radio controls); selecting one swaps the products shown below, either as a
 * product grid or a Swiper slider.
 *
 * Differences from the Shopify original, on purpose:
 * - Products are passed in as props, so switching tabs swaps from props
 *   client-side — no per-collection `fetch` / section-rendering endpoint.
 * - Uses React Swiper (matching CollectionSwiper) instead of the imperative
 *   `new Swiper()` custom element.
 * - Highlight-tag feature is deferred (ProductCard has no type-tag element to
 *   attach it to yet).
 * - The Liquid CTA is omitted — it was dead code there (gated behind
 *   `{% if blank %}`, never rendered).
 *
 * Class names mirror the Shopify markup so the migrated Sass drops in.
 * Product counts are the caller's responsibility (the Shopify caps of 16 grid
 * / 10 slider were a function of loading full collections).
 */

export interface CollectionGroupItem {
  /** Collection slug; used as the radio value/key and link target. */
  handle: string;
  /** Collection's own title. */
  title: string;
  /** Shown instead of `title` in the control when set. */
  customTitle?: string;
  /** Collection URL, e.g. `/collections/<handle>` (kept as data-url for parity). */
  url?: string;
  /** Thumbnail image URL for the control background (when `showThumbnail`). */
  thumbnailUrl?: string;
  /** Products to render for this collection. */
  products: Product[];
}

export interface CollectionGroupProps {
  heading?: string;
  showThumbnail?: boolean;
  /** Render the products as a slider instead of a grid. */
  showProductsSlider?: boolean;
  // Optional so the component stays assignable to Faust's WordPressBlock type
  // when registered; the empty case is guarded below.
  collections?: CollectionGroupItem[];
  /**
   * Controlled active-tab state, for callers that fetch a tab's products
   * lazily on selection (see LandingCollectionGroup) and need to know which
   * tab is active before this component does. Falls back to internal state
   * when omitted, so existing uncontrolled callers are unaffected.
   */
  activeHandle?: string;
  onActiveChange?: (handle: string) => void;
  /** True while the active tab's products are still being fetched. */
  loading?: boolean;
}

export default function CollectionGroup({
  heading,
  showThumbnail = false,
  showProductsSlider = false,
  collections = [],
  activeHandle: controlledActiveHandle,
  onActiveChange,
  loading = false,
}: CollectionGroupProps) {
  const [internalActiveHandle, setInternalActiveHandle] = useState(collections[0]?.handle);
  const activeHandle = controlledActiveHandle ?? internalActiveHandle;
  const setActiveHandle = onActiveChange ?? setInternalActiveHandle;

  if (collections.length === 0) {
    return null;
  }

  const active =
    collections.find((c) => c.handle === activeHandle) ?? collections[0];

  return (
    <section className="collection-group">
      {heading && <h3 className="collection-group__title">{heading}</h3>}

      <div className="collection-group__block-controls">
        <div
          className={`collection-group_block-controls-box${
            showThumbnail ? ' show-thumbnails' : ''
          }`}
        >
          {collections.map((collection) => (
            <label
              key={collection.handle}
              className="collection-group__block-control"
            >
              <input
                name="collection-group"
                type="radio"
                value={collection.handle}
                data-url={collection.url}
                checked={collection.handle === active.handle}
                onChange={() => setActiveHandle(collection.handle)}
                style={
                  showThumbnail && collection.thumbnailUrl
                    ? { backgroundImage: `url(${collection.thumbnailUrl})` }
                    : undefined
                }
              />
              <span className="block-control__title">
                {collection.customTitle || collection.title}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="container">
        {loading ? (
          <div className="collection-group__loading">Loading…</div>
        ) : showProductsSlider ? (
          <div className="collection-group__products-slider">
            <Swiper
              key={active.handle}
              slidesPerView={1.5}
              slidesOffsetBefore={75}
              slidesOffsetAfter={75}
              modules={[Pagination, Navigation, Mousewheel]}
              pagination={{ clickable: true }}
              navigation
              mousewheel={{ enabled: true, forceToAxis: true }}
              breakpoints={{
                768: {
                  slidesPerView: 3,
                  slidesOffsetBefore: 50,
                  slidesOffsetAfter: 50,
                },
                1024: {
                  slidesPerView: 5,
                  slidesOffsetBefore: 0,
                  slidesOffsetAfter: 0,
                },
              }}
            >
              {active.products.map((product) => (
                <SwiperSlide key={product.id}>
                  <ProductCard product={product} />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        ) : (
          <div className="products-grid">
            {active.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

CollectionGroup.displayName = 'CollectionGroup';
