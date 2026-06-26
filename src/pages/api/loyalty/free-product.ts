import type { NextApiRequest, NextApiResponse } from 'next';

const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ verified: false, error: 'method_not_allowed' });
  }

  if (!WP_BASE) {
    return res.status(503).json({ verified: false, error: 'not_configured' });
  }

  const target = `${WP_BASE}/wp-json/mellow-fellow/v1/loyalty/free-product`;

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch {
    return res.status(502).json({ verified: false, error: 'upstream_failed' });
  }
}
