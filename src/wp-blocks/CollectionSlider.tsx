import { gql, useQuery } from '@apollo/client';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation, Mousewheel } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/mousewheel';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';
import { getClient, getBrowserClient } from '@/lib/apollo-client';
import { GET_COLLECTION_SLIDER_PRODUCTS } from '@/graphql/queries/collections';

interface CollectionNode {
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
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
  const count = Math.max(1, Math.floor(data?.productCount || 8));
  
  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data: productsData } = useQuery(GET_COLLECTION_SLIDER_PRODUCTS, {
    client,
    variables: { collectionSlug: collection?.slug, first: count },
    skip: !collection?.slug,
  });

  if (!collection) {
    return null;
  }

  const products = ((productsData?.products?.nodes as Product[] | undefined) ?? []).slice(0, count);
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
            spaceBetween={16}
            slidesPerView={2}
            slidesOffsetAfter={8}
            slidesOffsetBefore={8}
            modules={[Autoplay, Pagination, Navigation, Mousewheel]}
            pagination={{ clickable: true }}
            navigation
            breakpoints={{
              769: {
                slidesPerView: 2
              },
              992: {
                slidesPerView: 3
              },
              1400: {
                slidesPerView: 4
              },
            }}
            mousewheel={{
              enabled: true,
              forceToAxis: true
            }}
            cssMode={true}
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
              databaseId
              name
              slug
            }
          }
        }
      }
    }
  `,
};
