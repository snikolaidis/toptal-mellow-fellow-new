import { gql } from '@apollo/client';
import { useState, useEffect } from 'react';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';

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

  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!collection?.slug) return;
    let cancelled = false;
    fetch(`/api/shop/products?collection=${encodeURIComponent(collection.slug)}&first=${count}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res.success) {
          setProducts((res.products || []).slice(0, count));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [collection?.slug, count]);

  if (!collection || products.length === 0) {
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
