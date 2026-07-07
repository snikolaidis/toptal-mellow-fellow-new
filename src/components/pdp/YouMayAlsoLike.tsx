import { useEffect, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/types/woocommerce';
import styles from './PdpProductRow.module.css';

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
}

interface Props {
  productId: number;
  productSlug: string;
  productPrice: string;
  typeSlugs: string[];
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
  } as Product;
}

export default function YouMayAlsoLike({ productId, productSlug, productPrice, typeSlugs }: Props) {
  const [recs, setRecs] = useState<RecProduct[]>([]);
  const typeKey = typeSlugs.join(',');

  useEffect(() => {
    if (!productId || !typeKey) {
      setRecs([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      productTypes: typeKey,
      excludeProductIds: String(productId),
      cartProductSlugs: productSlug,
      cartTotal: String(parsePrice(productPrice)),
      limit: '8',
    });
    fetch(`/api/shop/recommendations?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRecs(data.success ? data.products || [] : []);
      })
      .catch(() => {
        if (!cancelled) setRecs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, productSlug, productPrice, typeKey]);

  if (recs.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>You may also like</h2>
      <div className="products-grid">
        {recs.map((r) => (
          <ProductCard key={r.slug} product={toProduct(r)} />
        ))}
      </div>
    </section>
  );
}
