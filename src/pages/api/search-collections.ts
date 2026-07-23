import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({ success: false, collections: [] });
  }

  try {
    const url = `${WP_URL}/wp-json/mf/v1/search-collections?q=${encodeURIComponent(q)}`;
    const wpRes = await fetch(url);
    const data = await wpRes.json();

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Search Collections API] REST query failed');
    return res.status(500).json({ success: false, collections: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
