import type { NextApiRequest, NextApiResponse } from 'next';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(`${WP_URL}/wp-json/mellow-fellow/v1/cart-offers`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`WP REST returned ${response.status}`);
    }
    const data = await response.json();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch {
    return res.status(200).json({
      freeShippingThreshold: 80,
      freeGift: { enabled: false, threshold: 100, maxGiftPrice: 10, mode: 'select' },
      tiers: [{ amount: 80, label: 'Free Shipping' }],
    });
  }
}
