import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'https';
import http from 'http';
import { withRateLimitOnly } from '@/lib/middleware';

const keepAliveAgent = new https.Agent({ keepAlive: true });
const keepAliveAgentHttp = new http.Agent({ keepAlive: true });

const CART_TOKEN_COOKIE = 'wc_cart_token';

function extractCartToken(cookies: string): string | null {
  const match = cookies.match(/wc_cart_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function createCartTokenCookie(token: string): string {
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${CART_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Expires=${expiry}; SameSite=Lax${secure}`;
}

interface ProxyResponse {
  status: number;
  data: any;
  headers: http.IncomingHttpHeaders;
}

function wpRequest(
  wordpressUrl: string,
  path: string,
  method: string,
  cartToken: string | null,
  bodyStr: string
): Promise<ProxyResponse> {
  const url = new URL(`${wordpressUrl}/wp-json/wc/store/v1/${path}`);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const headers: Record<string, string | number> = {
    'Accept': 'application/json',
  };
  if (bodyStr) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(bodyStr);
  }
  if (cartToken) {
    headers['Cart-Token'] = cartToken;
  }

  return new Promise((resolve, reject) => {
    const proxyReq = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
        agent: isHttps ? keepAliveAgent : keepAliveAgentHttp,
        timeout: 15000,
      },
      (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk) => { data += chunk; });
        proxyRes.on('end', () => {
          try {
            resolve({ status: proxyRes.statusCode || 500, data: JSON.parse(data), headers: proxyRes.headers });
          } catch {
            resolve({ status: proxyRes.statusCode || 500, data, headers: proxyRes.headers });
          }
        });
      }
    );
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      reject(new Error('WordPress request timed out'));
    });
    proxyReq.on('error', reject);
    if (bodyStr) {
      proxyReq.write(bodyStr);
    }
    proxyReq.end();
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const storePath = Array.isArray(path) ? path.join('/') : path || '';

  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

  const cookies = req.headers.cookie || '';
  let cartToken = extractCartToken(cookies);

  const bodyStr = req.method !== 'GET' && req.body
    ? JSON.stringify(req.body)
    : '';

  const cookiesToSet: string[] = [];

  try {
    // Store API POSTs without a Cart-Token fall back to cookie+nonce auth and
    // fail with woocommerce_rest_missing_nonce. If the browser has no token
    // yet (first action before any cart fetch completed), mint a session
    // first so the mutation lands in a real cart instead of erroring.
    if (!cartToken && req.method !== 'GET') {
      try {
        const mint = await wpRequest(wordpressUrl, 'cart', 'GET', null, '');
        const minted = mint.headers['cart-token'] as string | undefined;
        if (minted) {
          cartToken = minted;
          cookiesToSet.push(createCartTokenCookie(minted));
        }
      } catch {
        // Minting failed — proceed without a token; WP will report the error.
      }
    }

    const response = await wpRequest(
      wordpressUrl,
      storePath,
      req.method || 'GET',
      cartToken,
      bodyStr
    );

    const newCartToken = response.headers['cart-token'] as string | undefined;
    if (newCartToken && newCartToken !== cartToken) {
      cookiesToSet.push(createCartTokenCookie(newCartToken));
    }

    // Session death is ONLY an invalid cart key — the session genuinely no
    // longer exists server-side. Generic 403s (host security, rate limits)
    // and nonce errors are transient; nuking the cookie on those destroys a
    // perfectly good cart and was a root cause of "my cart disappeared".
    const responseCode = typeof response.data?.code === 'string' ? response.data.code : '';
    const isSessionDead = responseCode === 'woocommerce_rest_cart_invalid_key';

    if (isSessionDead && cartToken) {
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      cookiesToSet.push(
        `${CART_TOKEN_COOKIE}=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`
      );
      if (!response.data || typeof response.data !== 'object') {
        response.data = {};
      }
      response.data._sessionExpired = true;
    }

    if (cookiesToSet.length > 0) {
      res.setHeader('Set-Cookie', cookiesToSet);
    }

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Store API proxy error:', error);
    if (cookiesToSet.length > 0) {
      res.setHeader('Set-Cookie', cookiesToSet);
    }
    return res.status(500).json({
      code: 'store_api_proxy_error',
      message: 'The store is taking longer than usual to respond. Please try again.',
    });
  }
}

export default withRateLimitOnly(120, 60000)(handler);
