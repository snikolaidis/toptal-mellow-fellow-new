import { fragments } from './CollectionSlider.fragments';
import { useState, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';
import { useCollectionFilter } from '@/context/CollectionFilterContext';

// Swiper only loops when the track holds more slides than it shows at once. With
// 8 products at 4 per view it silently stops advancing, so the list is repeated
// until the track clears this count. Do not collapse `track` back to `products`.
const MIN_TRACK_SLIDES = 16;

const SWIPER_BREAKPOINTS = {
  769: { slidesPerView: 2 },
  992: { slidesPerView: 4 },
} as const;

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
  const taxonomy =
    selected?.taxonomy || (collection?.__typename || 'Collection').toLowerCase();

  const [products, setProducts] = useState<Product[]>([]);

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

  const title = data?.title || '';
  const rawVariant = data?.backgroundVariant || '';
  const variant = rawVariant && rawVariant !== 'default' ? rawVariant : '';

  return (
    <section
      className={`collection-swiper${
        variant ? ` collection-swiper--${variant.replace(/_/g, '-')}` : ''
      }`}
    >
      <div className="container">
        {title.length > 0 && <h3 className="section__title">{title}</h3>}

        <div className="collection-swiper__products-slider">
          <Swiper
            spaceBetween={16}
            slidesPerView={2}
            slidesOffsetAfter={8}
            slidesOffsetBefore={8}
            modules={[Pagination, Autoplay]}
            pagination={{ clickable: true, dynamicBullets: true }}
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
        </div>
      </div>
    </section>
  );
}

CollectionSlider.displayName = 'AcfCollectionSlider';

CollectionSlider.fragments = fragments;
