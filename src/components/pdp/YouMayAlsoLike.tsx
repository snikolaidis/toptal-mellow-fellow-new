import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/types/woocommerce';
import { WidgetSource } from '@/lib/widgetAttribution';

const ProductCarousel = dynamic(() => import('./ProductCarousel'), { ssr: false });

interface RecProduct {
  id: string;
  databaseId: number;
  name: string;
  slug: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
  image?: { sourceUrl: string; altText?: string };
  stockStatus?: string;
  typeLabel?: string;
  bbBundleMode?: 'byob' | 'fixed' | 'mystery' | null;
  bbShowPrice?: boolean | null;
  bbFromPrice?: number | null;
  bbFixedPrice?: number | null;
  bbFixedOriginalPrice?: number | null;
}

export type ProductRowSource =
  | {
      kind: 'recommendations';
      productId: number;
      productSlug: string;
      productPrice: string;
      typeSlugs: string[];
    }
  | {
      kind: 'taxonomy';
      slug: string;
      taxonomy: 'collection' | 'mood';
      count?: number;
    };

interface Props {
  source: ProductRowSource;
  title?: string;
  layout?: 'grid' | 'carousel';
  attribution?: WidgetSource;
  className?: string;
}

function parsePrice(price: string | undefined): number {
  if (!price) return 0;
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

function toProduct(r: RecProduct): Product {
  return {
    id: r.id || String(r.databaseId),
    databaseId: r.databaseId,
    name: r.name,
    slug: r.slug,
    price: r.price,
    regularPrice: r.regularPrice,
    salePrice: r.salePrice,
    stockStatus: (r.stockStatus as Product['stockStatus']) || 'IN_STOCK',
    image: r.image ? { sourceUrl: r.image.sourceUrl, altText: r.image.altText || r.name } : undefined,
    __typename: 'SimpleProduct',
    mfproductTypes: r.typeLabel ? { nodes: [{ name: r.typeLabel }] } : undefined,
    bbBundleMode: r.bbBundleMode,
    bbShowPrice: r.bbShowPrice,
    bbFromPrice: r.bbFromPrice,
    bbFixedPrice: r.bbFixedPrice,
    bbFixedOriginalPrice: r.bbFixedOriginalPrice,
  } as Product;
}

function buildUrl(source: ProductRowSource): string {
  if (source.kind === 'recommendations') {
    const typeKey = source.typeSlugs.join(',');
    if (!source.productId || !typeKey) return '';
    return `/api/shop/recommendations?${new URLSearchParams({
      productTypes: typeKey,
      excludeProductIds: String(source.productId),
      cartProductSlugs: source.productSlug,
      cartTotal: String(parsePrice(source.productPrice)),
      limit: '8',
    })}`;
  }

  if (!source.slug) return '';
  return `/api/shop/products?${new URLSearchParams({
    collection: source.slug,
    taxonomy: source.taxonomy,
    first: String(source.count || 8),
  })}`;
}

export default function YouMayAlsoLike({
  source,
  title,
  layout = 'grid',
  attribution = 'you_may_also_like',
  className,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);

  // Strings, not `source`, in the dependency array below. The PDP builds
  // typeSlugs inline, so the object's identity changes every render and
  // depending on it refetches forever.
  const url = buildUrl(source);
  const kind = source.kind;

  useEffect(() => {
    if (!url) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = data.success ? data.products || [] : [];
        setProducts(kind === 'recommendations' ? rows.map(toProduct) : rows);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [url, kind]);

  if (products.length === 0) return null;

  return (
    <section className={className ? `you-may-also-like ${className}` : 'you-may-also-like'}>
      <h2 className="section__title">{title || 'You may also like'}</h2>
      {layout === 'carousel' ? (
        <ProductCarousel products={products} source={attribution} />
      ) : (
        <div className="products-grid">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} source={attribution} />
          ))}
        </div>
      )}
    </section>
  );
}
