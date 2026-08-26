import { fragments } from './CollectionSlider.fragments';
import { useState, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import type { Swiper as SwiperInstance } from 'swiper';
import 'swiper/css';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';
import { useCollectionFilter } from '@/context/CollectionFilterContext';
import { taxonomyForTypename } from '@/lib/taxonomy';

// Swiper only loops when the track holds more slides than it shows at once. With
// 8 products at 4 per view it silently stops advancing, so the list is repeated
// until the track clears this count. Do not collapse `track` back to `products`,
// and do not lower this: at 16 the second and third carousels reach the end of
// the track and freeze there instead of wrapping.
const MIN_TRACK_SLIDES = 20;

const SWIPER_BREAKPOINTS = {
  769: { slidesPerView: 2 },
  992: { slidesPerView: 4 },
} as const;

// Swiper's own pagination counts the repeated track, which is 16 to 24 bullets
// for what the design shows as a handful of page dots. These are page dots over
// the real products instead, and the repeats stay invisible to the reader.
function pageOf(swiper: SwiperInstance, total: number, perView: number) {
  return Math.floor((swiper.realIndex % total) / perView);
}

function viewOf(swiper: SwiperInstance) {
  const perView = swiper.params.slidesPerView;
  return typeof perView === 'number' ? Math.max(1, Math.floor(perView)) : 1;
}

interface CollectionNode {
  __typename?: string | null;
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
}

interface CollectionSliderProps {
  collectionSlider?: {
    title?: string | null;
    productCount?: number | null;
    backgroundVariant?: string | null;
    filterGroup?: string | null;
    collection?: {
      nodes?: CollectionNode[] | null;
      node?: CollectionNode | null;
    } | null;
  } | null;
}

export default function CollectionSlider(props: CollectionSliderProps) {
  const data = props.collectionSlider;
  const collection = data?.collection?.nodes?.[0] ?? data?.collection?.node ?? null;
  const count = Math.max(1, Math.floor(data?.productCount || 8));
  const { selected } = useCollectionFilter(data?.filterGroup);
  const slug = selected?.slug || collection?.slug || '';
  const taxonomy = selected?.taxonomy || taxonomyForTypename(collection?.__typename);

  const [products, setProducts] = useState<Product[]>([]);
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  const [perView, setPerView] = useState(2);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const query = new URLSearchParams({
      collection: slug,
      taxonomy,
      first: String(count),
    });
    fetch(`/api/shop/products?${query.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res.success) {
          setProducts((res.products || []).slice(0, count));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug, taxonomy, count]);

  if (!slug || products.length === 0) {
    return null;
  }

  const copies = Math.max(2, Math.ceil(MIN_TRACK_SLIDES / products.length));
  const track = Array.from({ length: copies }, () => products).flat();
  const pageCount = Math.ceil(products.length / perView);

  const title = data?.title || '';
  const rawVariant = data?.backgroundVariant || '';
  const variant = rawVariant && rawVariant !== 'default' ? rawVariant : '';

  return (
    <section
      className={`collection-swiper${
        variant ? ` collection-swiper--${variant.replace(/_/g, '-')}` : ''
      }`}
      // Lets the panel behind the products carry the same colour as the active
      // mood tab above it, instead of staying gold whatever mood is picked.
      data-term={taxonomy === 'mood' ? slug : undefined}
    >
      <div className="container">
        {title.length > 0 && <h3 className="section__title">{title}</h3>}

        <div className="collection-swiper__products-slider">
          <Swiper
            spaceBetween={16}
            slidesPerView={2.2}
            slidesOffsetAfter={8}
            slidesOffsetBefore={8}
            modules={[Autoplay]}
            onSwiper={(instance) => {
              setSwiper(instance);
              setPerView(viewOf(instance));
            }}
            onBreakpoint={(instance) => setPerView(viewOf(instance))}
            onSlideChange={(instance) =>
              setPage(pageOf(instance, products.length, viewOf(instance)))
            }
            autoplay={{
              delay: 4000,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
            }}
            loop
            breakpoints={SWIPER_BREAKPOINTS}
          >
            {track.map((product, i) => (
              <SwiperSlide key={`${product.id}-${i}`}>
                <ProductCard product={product} />
              </SwiperSlide>
            ))}
          </Swiper>

          {pageCount > 1 && (
            <div className="collection-swiper__dots">
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`collection-swiper__dot${
                    i === page % pageCount ? ' collection-swiper__dot--active' : ''
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => swiper?.slideToLoop(i * perView)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

CollectionSlider.displayName = 'AcfCollectionSlider';

CollectionSlider.fragments = fragments;
