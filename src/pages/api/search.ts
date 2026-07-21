import type { NextApiRequest, NextApiResponse } from 'next';
import { Meilisearch } from 'meilisearch';
import { withRateLimitOnly } from '@/lib/middleware';

const MEILI_HOST = process.env.MEILISEARCH_HOST || '';
const MEILI_SEARCH_KEY = process.env.MEILISEARCH_SEARCH_KEY || '';
const PRODUCTS_INDEX = 'products';

interface ProductHit {
  id?: string | null;
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
  price?: string | null;
  regularPrice?: string | null;
  salePrice?: string | null;
  stockStatus?: string | null;
  image?: { sourceUrl?: string | null; altText?: string | null } | null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Search query must be at least 2 characters',
      products: [],
    });
  }

  const firstRaw = typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : 8;
  const first = Math.max(1, Math.min(48, Number.isFinite(firstRaw) ? firstRaw : 8));

  if (!MEILI_HOST || !MEILI_SEARCH_KEY) {
    return res.status(503).json({ success: false, message: 'Search is not configured', products: [] });
  }

  try {
    const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_SEARCH_KEY });
    const result = await client.index(PRODUCTS_INDEX).search<ProductHit>(q, {
      limit: first,
      attributesToRetrieve: [
        'databaseId',
        'id',
        'name',
        'slug',
        'price',
        'regularPrice',
        'salePrice',
        'stockStatus',
        'image',
      ],
    });

    const products = result.hits.map((hit) => ({
      id: hit.id,
      databaseId: hit.databaseId,
      name: hit.name,
      slug: hit.slug,
      price: hit.price || '',
      regularPrice: hit.regularPrice || '',
      salePrice: hit.salePrice || '',
      stockStatus: hit.stockStatus || 'IN_STOCK',
      image: hit.image?.sourceUrl
        ? { sourceUrl: hit.image.sourceUrl, altText: hit.image.altText || hit.name || '' }
        : null,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({
      success: true,
      products,
      query: q,
      hasNextPage: (result.estimatedTotalHits ?? 0) > first,
      endCursor: null,
    });
  } catch (error) {
    console.error('[Search API] Query failed');
    return res.status(500).json({ success: false, message: 'Search failed', products: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
