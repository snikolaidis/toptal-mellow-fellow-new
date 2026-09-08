import type { NextApiRequest, NextApiResponse } from 'next';

const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const APP_USER = process.env.REAL_ID_WP_APP_USER || process.env.WP_API_USER;
const APP_PASS = process.env.REAL_ID_WP_APP_PASSWORD || process.env.WP_API_APP_PASSWORD;

/*
 * This proxy authenticates every forwarded request as a privileged WP
 * application-password user, so anonymous storefront visitors can create/
 * read their own Real ID check (routes the plugin itself gates behind
 * `manage_real_id`). That means it must only ever forward the exact routes
 * our checkout flow needs - never a blanket `real-id/` prefix - otherwise it
 * also exposes the plugin's admin-only actions (manually approve/reject a
 * check, list/search all checks, etc.) to unauthenticated requests.
 *
 * Verified against the getverdict SDK bundle (real-id-flow.getverdict.com)
 * and this repo's own call sites - the SDK's actual check/document
 * processing goes straight to https://real-id.getverdict.com, never through
 * this proxy. Only these five routes are ever requested here:
 */
const ALLOWED_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: 'POST', pattern: /^real-id\/v1\/checks$/ },
  { method: 'GET', pattern: /^real-id\/v1\/checks\/[a-zA-Z0-9_-]+$/ },
  { method: 'GET', pattern: /^real-id\/v1\/shop\/public\/settings$/ },
  { method: 'POST', pattern: /^real-id\/v1\/public\/session$/ },
  { method: 'POST', pattern: /^real-id\/v1\/check\/order\/associate$/ },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!WP_BASE || !APP_USER || !APP_PASS) {
    return res.status(503).json({ message: 'Real ID proxy not configured' });
  }

  const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
  const path = segments.filter(Boolean).join('/');
  const method = req.method || 'GET';

  const isAllowed = ALLOWED_ROUTES.some((route) => route.method === method && route.pattern.test(path));

  if (!isAllowed) {
    console.warn(`[RealID][proxy] blocked disallowed route: ${method} ${path}`);
    return res.status(403).json({ message: 'Forbidden path' });
  }

  const search = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = `${WP_BASE}/wp-json/${path}${search}`;
  const auth = 'Basic ' + Buffer.from(`${APP_USER}:${APP_PASS}`).toString('base64');

  const hasBody = method !== 'GET' && method !== 'HEAD' && req.body !== undefined;

  console.log(`[RealID][proxy] -> ${method} ${path}`);

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

    let step: unknown;
    let status: unknown;
    try {
      const parsed = JSON.parse(text);
      step = parsed?.check?.step ?? parsed?.step;
      status = parsed?.check?.status ?? parsed?.status;
    } catch {
      // Non-JSON or unrelated payload - nothing to log beyond the HTTP status.
    }

    console.log(
      `[RealID][proxy] <- ${method} ${path} status=${upstream.status}` +
        (step !== undefined || status !== undefined ? ` step=${step} status_field=${status}` : ''),
    );

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    console.error(`[RealID][proxy] request failed for ${method} ${path}:`, error);
    return res.status(502).json({ message: 'Real ID upstream request failed' });
  }
}
