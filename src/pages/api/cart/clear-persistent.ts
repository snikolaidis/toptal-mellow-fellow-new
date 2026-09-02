import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'https';
import http from 'http';
import { withRateLimitOnly } from '@/lib/middleware';
import { verifyJwt, extractJwt } from '@/lib/jwt-auth';
import { validateSession } from '@/lib/session-manager';

const keepAliveAgent = new https.Agent({ keepAlive: true });
const keepAliveAgentHttp = new http.Agent({ keepAlive: true });

function authenticatedDelete(url: string, faustSecret: string): Promise<{ data: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${faustSecret}`,
        },
        agent: isHttps ? keepAliveAgent : keepAliveAgentHttp,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ data: JSON.parse(body) }); }
          catch { resolve({ data: body }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  // Always clear the cart token cookie so the next Store API request starts a
  // completely fresh WC session — even if the WP meta deletion below fails.
  const clearCookies = [
    `wc_cart_token=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`,
  ];

  try {
    const cookies = req.headers.cookie || '';
    const jwt = extractJwt(cookies);
    const auth = jwt ? verifyJwt(jwt) : null;

    if (!auth || !(await validateSession(auth.sessionId))) {
      res.setHeader('Set-Cookie', clearCookies);
      return res.status(200).json({ success: true, cleared: true });
    }

    const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const faustSecret = process.env.FAUST_SECRET_KEY || '';

    await authenticatedDelete(
      `${wordpressUrl}/wp-json/mf/v1/cart-token/${auth.userId}`,
      faustSecret,
    );

    res.setHeader('Set-Cookie', clearCookies);
    return res.status(200).json({ success: true, cleared: true });
  } catch (err) {
    console.error('[clear-persistent] Error:', err);
    res.setHeader('Set-Cookie', clearCookies);
    return res.status(200).json({ success: true, cleared: false });
  }
}

export default withRateLimitOnly(10, 60000)(handler);
