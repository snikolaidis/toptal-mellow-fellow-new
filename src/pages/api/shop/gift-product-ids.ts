import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { collections } = req.query;
  if (!collections || typeof collections !== 'string') {
    return res.status(400).json({ error: 'missing_collections' });
  }

  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

  try {
    const wpRes = await fetch(
      `${wpUrl}/wp-json/mellow-fellow/v1/gift-product-ids?collections=${encodeURIComponent(collections)}`
    );
    const data = await wpRes.json();

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(data);
  } catch {
    return res.status(200).json({ ids: [] });
  }
}
