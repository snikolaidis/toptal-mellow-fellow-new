import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({ success: false, posts: [] });
  }

  const firstRaw = typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : 4;
  const first = Math.max(1, Math.min(12, Number.isFinite(firstRaw) ? firstRaw : 4));

  try {
    const url = `${WP_URL}/wp-json/mf/v1/search-blogs?q=${encodeURIComponent(q)}&first=${first}`;
    const wpRes = await fetch(url);
    const data = await wpRes.json();

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Search Blogs API] REST query failed');
    return res.status(500).json({ success: false, posts: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
