import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import { withRateLimitOnly } from '@/lib/middleware';
import { cachedQuery } from '@/lib/cache';

const SEARCH_COLLECTIONS = gql`
  query SearchCollections($search: String!) {
    collections(first: 12, where: { search: $search }) {
      nodes {
        name
        slug
        count
      }
    }
  }
`;

interface CollectionResult {
  name: string;
  slug: string;
  count: number;
}

function isReadableName(name: string): boolean {
  return /\s/.test(name) || !name.includes('-');
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({ success: false, collections: [] });
  }

  try {
    const client = getClient();
    const { data } = await cachedQuery(client, {
      query: SEARCH_COLLECTIONS,
      variables: { search: q },
    }, { ttl: 300 });

    const collections: CollectionResult[] = (data?.collections?.nodes || [])
      .filter((c: CollectionResult) => c.count > 0 && isReadableName(c.name))
      .slice(0, 4)
      .map((c: CollectionResult) => ({ name: c.name, slug: c.slug, count: c.count }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({ success: true, collections });
  } catch (error) {
    console.error('[Search Collections API] Query failed');
    return res.status(500).json({ success: false, collections: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
