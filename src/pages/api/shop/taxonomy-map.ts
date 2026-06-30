/**
 * Taxonomy Map API — proxies the WP REST endpoint /mf/v1/taxonomy-map
 * which uses a single SQL query to build the product→taxonomy index.
 * O(P+T) complexity, cached 2 minutes server-side.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

// In-memory cache
let cache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 120_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false });
  }

  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL) {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json(cache.data);
  }

  try {
    const response = await fetch(`${WP_URL}/wp-json/mf/v1/taxonomy-map`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`WP REST API returned ${response.status}`);
    }

    const data = await response.json();
    cache = { data, timestamp: now };

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Taxonomy Map] Failed:', error);
    return res.status(500).json({ success: false });
  }
}
