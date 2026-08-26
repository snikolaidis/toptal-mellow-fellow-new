import type { Product } from '@/types/woocommerce';

interface CacheEntry {
  products: Product[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const STALE_MS = 5 * 60 * 1000; // 5 minutes — matches server Cache-Control
let inflightController: AbortController | null = null;

export function buildRecsCacheKey(productIds: number[], subtotal: number): string {
  const bucket = Math.floor(subtotal / 10) * 10;
  return `${productIds.sort((a, b) => a - b).join(',')}_${bucket}`;
}

export function getCachedRecs(key: string): Product[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry.products;
}

export function isRecsFresh(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < STALE_MS;
}

export function setRecsCache(key: string, products: Product[]): void {
  cache.set(key, { products, fetchedAt: Date.now() });
}

export function abortInflightRecs(): void {
  if (inflightController) {
    inflightController.abort();
    inflightController = null;
  }
}

export function getRecsAbortSignal(): AbortSignal {
  abortInflightRecs();
  inflightController = new AbortController();
  return inflightController.signal;
}

function parsePrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

export async function fetchRecommendations(
  productIds: number[],
  productSlugs: string[],
  subtotal: number,
  signal?: AbortSignal,
): Promise<Product[]> {
  const params = new URLSearchParams({
    context: 'cart',
    cartTotal: String(subtotal),
    excludeProductIds: productIds.join(','),
    cartProductSlugs: productSlugs.join(','),
    cartProductIds: productIds.join(','),
    limit: '4',
  });

  const res = await fetch(`/api/shop/recommendations?${params}`, { signal });
  const data = await res.json();
  return data.success ? data.products : [];
}
