import { useEffect, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/types/woocommerce';
import { getRecentlyViewed, RecentProduct } from '@/lib/recentlyViewed';

interface Props {
  currentSlug: string;
  titleClassName?: string;
}

function toProduct(r: RecentProduct): Product {
  return {
    id: String(r.databaseId),
    databaseId: r.databaseId,
    name: r.name,
    slug: r.slug,
    price: r.price,
    regularPrice: r.regularPrice,
    salePrice: r.salePrice,
    stockStatus: 'IN_STOCK',
    image: r.image ? { sourceUrl: r.image.sourceUrl, altText: r.image.altText || r.name } : undefined,
    __typename: 'SimpleProduct',
    mfproductTypes: r.typeLabel ? { nodes: [{ name: r.typeLabel }] } : undefined,
    bbBundleMode: r.bbBundleMode,
    bbFixedPrice: r.bbFixedPrice,
    bbFixedOriginalPrice: r.bbFixedOriginalPrice,
    bbFromPrice: r.bbFromPrice,
    bbShowPrice: r.bbShowPrice,
  } as Product;
}

export default function RecentlyViewed({ currentSlug, titleClassName }: Props) {
  const [items, setItems] = useState<RecentProduct[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed(currentSlug).slice(0, 8));
  }, [currentSlug]);

  if (items.length === 0) return null;

  return (
    <section className="recently-viewed">
      <h2 className={`section__title ${titleClassName || ''}`}>
        Recently viewed
      </h2>
      <div className="products-grid">
        {items.map((r) => (
          <ProductCard key={r.slug} product={toProduct(r)} source="recently_viewed" />
        ))}
      </div>
    </section>
  );
}
