import { gql, useQuery } from '@apollo/client';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';
import { getClient, getBrowserClient } from '@/lib/apollo-client';
import { GET_COLLECTION_SLIDER_PRODUCTS } from '@/graphql/queries/collections';

/**
 * Backend-managed featured collection (ACF block `acf/featured-collection`).
 * Replaces the hardcoded FeaturedCollection usage on the homepage: editors
 * pick a collection, product count and an optional CTA button; the products
 * are fetched client-side from that collection (same query the
 * CollectionSlider block uses) and rendered as a ProductCard grid.
 */

interface CollectionNode {
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
}

interface FeaturedCollectionProps {
  featuredCollection?: {
    title?: string | null;
    productCount?: number | null;
    button?: { url?: string | null; title?: string | null; target?: string | null } | null;
    collection?: {
      nodes?: CollectionNode[] | null;
      node?: CollectionNode | null;
    } | null;
  } | null;
}

export default function FeaturedCollection(props: FeaturedCollectionProps) {
  const data = props.featuredCollection;
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
  const button = data?.button;

  return (
    <section className="featured-collection">
      <div className="container">
        {title.length > 0 && <h3 className="section__title">{title}</h3>}

        <div className="products-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {button?.url && (
          <div className="featured-collection__cta">
            <a
              href={button.url}
              target={button.target || undefined}
              rel={button.target === '_blank' ? 'noopener noreferrer' : undefined}
              className='button is-black'
            >
              {button.title || 'Shop All'}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

FeaturedCollection.displayName = 'AcfFeaturedCollection';

FeaturedCollection.fragments = {
  key: `AcfFeaturedCollectionFragment`,
  entry: gql`
    fragment AcfFeaturedCollectionFragment on AcfFeaturedCollection {
      featuredCollection {
        title
        productCount
        button {
          url
          title
          target
        }
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
