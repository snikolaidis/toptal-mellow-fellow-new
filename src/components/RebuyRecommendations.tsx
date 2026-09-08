'use client';

import { useEffect, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import type { Product } from '@/types/woocommerce';

interface RebuyRecommendationsProps {
  title?: string;
  productId?: number;
  productIds?: number[];
  shopperId?: string;
  limit?: number;
  gridClass?: string;
  className?: string;
}

interface ApiResponse {
  success: boolean;
  products: Product[];
  count: number;
  message?: string;
}

export default function RebuyRecommendations({
  title = 'You may also like',
  productId,
  productIds,
  shopperId,
  limit = 4,
  gridClass = 'grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4',
  className = '',
}: RebuyRecommendationsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: String(limit) });
    if (productId) params.set('product_id', String(productId));
    if (productIds?.length) params.set('product_ids', productIds.join(','));
    if (shopperId) params.set('shopper_id', shopperId);

    setLoading(true);
    setError(false);

    fetch(`/api/rebuy/recommended?${params.toString()}`)
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((data) => {
        if (!active) return;
        if (data.success && data.products?.length) {
          setProducts(data.products);
        } else {
          setProducts([]);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId, productIds?.join(','), shopperId, limit]);

  if (error || (!loading && products.length === 0)) return null;

  return (
    <section className={`py-12 ${className}`}>
      {title && (
        <div className="mb-8">
          <h2 className="text-2xl font-light tracking-tight text-black md:text-3xl">{title}</h2>
        </div>
      )}

      {loading ? (
        <div className={gridClass}>
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="flex flex-col">
              <div className="aspect-square w-full animate-pulse bg-[#f5f5f0]" />
              <div className="pt-4">
                <div className="h-2 w-16 animate-pulse bg-[#e5e5e0]" />
                <div className="mt-2 h-3 w-3/4 animate-pulse bg-[#e5e5e0]" />
                <div className="mt-2 h-3 w-12 animate-pulse bg-[#e5e5e0]" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={gridClass}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
