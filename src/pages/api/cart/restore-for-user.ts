import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'https';
import http from 'http';
import { withRateLimitOnly } from '@/lib/middleware';
import { verifyJwt, extractJwt } from '@/lib/jwt-auth';
import { validateSession } from '@/lib/session-manager';

const keepAliveAgent = new https.Agent({ keepAlive: true });
const keepAliveAgentHttp = new http.Agent({ keepAlive: true });

const WP_TIMEOUT_MS = 8000;

function authenticatedRequest(
  url: string,
  method: 'GET' | 'DELETE',
  faustSecret: string
): Promise<{ data: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${faustSecret}`,
      },
      agent: isHttps ? keepAliveAgent : keepAliveAgentHttp,
      timeout: WP_TIMEOUT_MS,
    };

    const req = lib.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ data: JSON.parse(body) }); }
        catch { resolve({ data: body }); }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('WordPress request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const cookies = req.headers.cookie || '';

    // NEVER clobber a live cart session. If the browser already has a cart
    // token, the current session is the source of truth — restoring a saved
    // snapshot over it is how cleared carts came back from the dead.
    if (/wc_cart_token=[^;]+/.test(cookies)) {
      return res.status(200).json({ success: true, restored: false, reason: 'live_session' });
    }

    const jwt = extractJwt(cookies);
    const auth = jwt ? verifyJwt(jwt) : null;
    if (!auth || !(await validateSession(auth.sessionId))) {
      return res.status(200).json({ success: true, restored: false });
    }

    const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const faustSecret = process.env.FAUST_SECRET_KEY || '';

    const tokenRes = await authenticatedRequest(
      `${wordpressUrl}/wp-json/mf/v1/cart-token/${auth.userId}`,
      'GET',
      faustSecret,
    );

    const savedToken = tokenRes.data?.cartToken;
    if (!savedToken) {
      return res.status(200).json({ success: true, restored: false });
    }

    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `wc_cart_token=${encodeURIComponent(savedToken)}; Path=/; HttpOnly; Expires=${expiry}; SameSite=Lax${secure}`,
    ]);

    // One-shot restore: delete the saved token so a stale snapshot can never
    // be restored twice. From here the live cookie/session is the only truth;
    // logout (save-for-user) re-saves a fresh snapshot when needed.
    authenticatedRequest(
      `${wordpressUrl}/wp-json/mf/v1/cart-token/${auth.userId}`,
      'DELETE',
      faustSecret,
    ).catch(() => {});

    return res.status(200).json({ success: true, restored: true });
  } catch (err) {
    console.error('[restore-for-user] Error:', err);
    return res.status(200).json({ success: true, restored: false });
  }
}

export default withRateLimitOnly(10, 60000)(handler);
