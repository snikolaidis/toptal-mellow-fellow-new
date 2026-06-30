import { gql } from '@apollo/client';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';

/**
 * Backend-managed product carousel (ACF block `acf/collection-slider`). Replaces
 * the hardcoded CollectionSwiper: the editor picks a collection, an optional
 * title, and how many products to show. Slider behavior matches the old
 * component (responsive 2/3/4 per view).
 *
 * NOTE: the fragment references the shared product fragments (`...SimpleProductFields`
 * etc.) rather than redefining them — the consuming query (the front-page
 * template) must include those fragment definitions, which it already does.
 */

interface CollectionNode {
  name?: string | null;
  products?: { nodes?: Product[] | null } | null;
}

interface CollectionSliderProps {
  collectionSlider?: {
    title?: string | null;
    productCount?: number | null;
    collection?: {
      nodes?: CollectionNode[] | null;
      node?: CollectionNode | null;
    } | null;
  } | null;
}

export default function CollectionSlider(props: CollectionSliderProps) {
  const data = props.collectionSlider;
  const collection = data?.collection?.nodes?.[0] ?? data?.collection?.node ?? null;
  if (!collection) {
    return null;
  }

  const count = Math.max(1, Math.floor(data?.productCount || 8));
  const products = (collection.products?.nodes ?? []).slice(0, count);
  if (products.length === 0) {
    return null;
  }

  const title = data?.title || collection.name || '';

  return (
    <section className="section collection-swiper">
      <div className="container">
        {title.length > 0 && <h3 className="section__title">{title}</h3>}

        <div className="collection-swiper__products-slider">
          <Swiper
            slidesPerView={2}
            slidesOffsetAfter={9}
            slidesOffsetBefore={9}
            modules={[Autoplay, Pagination, Navigation]}
            pagination={{ clickable: true }}
            navigation
            breakpoints={{
              769: {
                slidesPerView: 2,
                slidesOffsetAfter: 0,
                slidesOffsetBefore: 0,
              },
              992: {
                slidesPerView: 3,
                slidesOffsetAfter: 0,
                slidesOffsetBefore: 0,
              },
              1400: {
                slidesPerView: 4,
                slidesOffsetAfter: 0,
                slidesOffsetBefore: 0,
              },
            }}
          >
            {products.map((product) => (
              <SwiperSlide key={product.id}>
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

CollectionSlider.fragments = {
  key: `AcfCollectionSliderFragment`,
  entry: gql`
    fragment AcfCollectionSliderFragment on AcfCollectionSlider {
      collectionSlider {
        title
        productCount
        collection {
          nodes {
            __typename
            ... on Collection {
              name
              products(first: 24) {
                nodes {
                  __typename
                  ... on SimpleProduct { ...SimpleProductFields }
                  ... on VariableProduct { ...VariableProductFields }
                  ... on ExternalProduct { ...ExternalProductFields }
                  ... on GroupProduct { ...GroupProductFields }
                }
              }
            }
          }
        }
      }
    }
  `,
};
