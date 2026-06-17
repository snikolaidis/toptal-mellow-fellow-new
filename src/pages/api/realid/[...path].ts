import type { NextApiRequest, NextApiResponse } from 'next';

const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const APP_USER = process.env.REAL_ID_WP_APP_USER || process.env.WP_API_USER;
const APP_PASS = process.env.REAL_ID_WP_APP_PASSWORD || process.env.WP_API_APP_PASSWORD;

const ALLOWED_PREFIX = 'real-id/';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!WP_BASE || !APP_USER || !APP_PASS) {
    return res.status(503).json({ message: 'Real ID proxy not configured' });
  }

  const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
  const path = segments.filter(Boolean).join('/');

  if (!path.startsWith(ALLOWED_PREFIX)) {
    return res.status(403).json({ message: 'Forbidden path' });
  }

  const search = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = `${WP_BASE}/wp-json/${path}${search}`;
  const auth = 'Basic ' + Buffer.from(`${APP_USER}:${APP_PASS}`).toString('base64');

  const method = req.method || 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD' && req.body !== undefined;

  try {
    const upstream = await fetch(target, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch {
    return res.status(502).json({ message: 'Real ID upstream request failed' });
  }
}
