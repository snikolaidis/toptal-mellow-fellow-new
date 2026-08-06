import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';
import { capQuery, getSearchClient, isSearchConfigured } from '@/lib/search-client';

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

  if (!isSearchConfigured()) {
    return res.status(503).json({ success: false, message: 'Search is not configured', products: [] });
  }

  const query = capQuery(q);

  try {
    const result = await getSearchClient().index(PRODUCTS_INDEX).search<ProductHit>(query, {
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
      query,
      hasNextPage: (result.estimatedTotalHits ?? 0) > first,
      endCursor: null,
    });
  } catch (error) {
    console.error('[Search API] Query failed:', error);
    return res.status(500).json({ success: false, message: 'Search failed', products: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
