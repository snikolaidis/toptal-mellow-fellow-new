// Rebuy client, server only. Key stays here, never goes to the browser.

const REBUY_BASE = 'https://rebuyengine.com/api/v1';

interface RebuyImage {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
}

interface RebuyVariant {
  id?: number;
  price?: string;
  compare_at_price?: string | null;
  available?: boolean;
  sku?: string;
}

export interface RebuyProduct {
  id: number;
  handle: string;
  title: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  status?: string;
  image?: RebuyImage;
  images?: RebuyImage[];
  variants?: RebuyVariant[];
  link?: string;
  admin_graphql_api_id?: string;
}

interface RebuyResponse {
  data?: RebuyProduct[];
  error?: string;
}

function getKey(): string {
  const key = process.env.REBUY_API_KEY;
  if (!key) throw new Error('REBUY_API_KEY is not configured');
  return key;
}

async function callRebuy(path: string, params: Record<string, string | number | string[] | number[]>): Promise<RebuyResponse> {
  const url = new URL(`${REBUY_BASE}${path}`);
  url.searchParams.set('key', getKey());
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(`${k}[]`, String(item));
    } else if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Rebuy API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function getRecommendedProducts(opts: {
  productIds?: number[];
  shopperId?: string;
  limit?: number;
}): Promise<RebuyProduct[]> {
  const params: Record<string, string | number | string[] | number[]> = {
    limit: opts.limit ?? 4,
  };
  if (opts.productIds?.length) params.product_ids = opts.productIds;
  if (opts.shopperId) params.shopper_id = opts.shopperId;

  const res = await callRebuy('/products/recommended', params);
  return res.data ?? [];
}
