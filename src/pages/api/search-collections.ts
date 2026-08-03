import type { NextApiRequest, NextApiResponse } from 'next';
import { Meilisearch } from 'meilisearch';
import { withRateLimitOnly } from '@/lib/middleware';

const MEILI_HOST = process.env.MEILISEARCH_HOST || '';
const MEILI_SEARCH_KEY = process.env.MEILISEARCH_SEARCH_KEY || '';
const COLLECTIONS_INDEX = 'collections';
const COLLECTION_LIMIT = 4;

interface CollectionHit {
  name?: string | null;
  slug?: string | null;
  count?: number | null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({ success: false, collections: [] });
  }

  if (!MEILI_HOST || !MEILI_SEARCH_KEY) {
    return res
      .status(503)
      .json({ success: false, message: 'Search is not configured', collections: [] });
  }

  try {
    const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_SEARCH_KEY });
    const result = await client.index(COLLECTIONS_INDEX).search<CollectionHit>(q, {
      limit: COLLECTION_LIMIT,
      sort: ['count:desc'],
      attributesToRetrieve: ['name', 'slug', 'count'],
    });

    const collections = result.hits.map((hit) => ({
      name: hit.name || '',
      slug: hit.slug || '',
      count: hit.count ?? 0,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({ success: true, collections });
  } catch (error) {
    console.error('[Search Collections API] Query failed');
    return res.status(500).json({ success: false, message: 'Search failed', collections: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
