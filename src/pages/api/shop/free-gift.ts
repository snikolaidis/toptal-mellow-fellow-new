import type { NextApiRequest, NextApiResponse } from 'next';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const productId = Number(req.body?.productId);
  if (!productId) {
    return res.status(400).json({ error: 'missing_product_id' });
  }

  try {
    const response = await fetch(`${WP_URL}/wp-json/mellow-fellow/v1/free-gift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId }),
    });
    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch {
    return res.status(500).json({ error: 'free_gift_unavailable' });
  }
}
