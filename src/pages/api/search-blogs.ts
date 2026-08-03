import type { NextApiRequest, NextApiResponse } from 'next';
import { Meilisearch } from 'meilisearch';
import { withRateLimitOnly } from '@/lib/middleware';

const MEILI_HOST = process.env.MEILISEARCH_HOST || '';
const MEILI_SEARCH_KEY = process.env.MEILISEARCH_SEARCH_KEY || '';
const POSTS_INDEX = 'posts';
const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 12;

interface PostHit {
  databaseId?: number | null;
  title?: string | null;
  slug?: string | null;
  date?: string | null;
  excerpt?: string | null;
  featuredImage?: { sourceUrl?: string | null; altText?: string | null } | null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({ success: false, posts: [] });
  }

  const firstRaw =
    typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : DEFAULT_LIMIT;
  const first = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isFinite(firstRaw) ? firstRaw : DEFAULT_LIMIT)
  );

  if (!MEILI_HOST || !MEILI_SEARCH_KEY) {
    return res
      .status(503)
      .json({ success: false, message: 'Search is not configured', posts: [] });
  }

  try {
    const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_SEARCH_KEY });
    const result = await client.index(POSTS_INDEX).search<PostHit>(q, {
      limit: first,
      sort: ['date:desc'],
      attributesToRetrieve: ['databaseId', 'title', 'slug', 'date', 'excerpt', 'featuredImage'],
    });

    const posts = result.hits.map((hit) => ({
      id: hit.databaseId ?? 0,
      title: hit.title || '',
      slug: hit.slug || '',
      date: hit.date || '',
      excerpt: hit.excerpt || '',
      featuredImage: hit.featuredImage?.sourceUrl
        ? {
            sourceUrl: hit.featuredImage.sourceUrl,
            altText: hit.featuredImage.altText || '',
          }
        : null,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({ success: true, posts });
  } catch (error) {
    console.error('[Search Blogs API] Query failed');
    return res.status(500).json({ success: false, message: 'Search failed', posts: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
