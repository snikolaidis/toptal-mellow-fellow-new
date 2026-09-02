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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const storePath = Array.isArray(path) ? path.join('/') : path || '';

  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const storeApiUrl = `${wordpressUrl}/wp-json/wc/store/v1/${storePath}`;

  const cookies = req.headers.cookie || '';
  const cartToken = extractCartToken(cookies);

  const bodyStr = req.method !== 'GET' && req.body
    ? JSON.stringify(req.body)
    : '';

  const url = new URL(storeApiUrl);
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

  try {
    const response = await new Promise<{
      status: number;
      data: any;
      headers: http.IncomingHttpHeaders;
    }>((resolve, reject) => {
      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: req.method || 'GET',
        headers,
        agent: isHttps ? keepAliveAgent : keepAliveAgentHttp,
        timeout: 15000,
      };

      const proxyReq = lib.request(reqOptions, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk) => { data += chunk; });
        proxyRes.on('end', () => {
          try {
            resolve({
              status: proxyRes.statusCode || 500,
              data: JSON.parse(data),
              headers: proxyRes.headers,
            });
          } catch {
            resolve({
              status: proxyRes.statusCode || 500,
              data,
              headers: proxyRes.headers,
            });
          }
        });
      });

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

    const cookiesToSet: string[] = [];

    const newCartToken = response.headers['cart-token'] as string | undefined;
    if (newCartToken) {
      cookiesToSet.push(createCartTokenCookie(newCartToken));
    }

    const responseCode = typeof response.data?.code === 'string' ? response.data.code : '';
    const isSessionDead =
      responseCode === 'woocommerce_rest_cart_invalid_key' ||
      (response.status === 403 && /cart_invalid_key|rest_forbidden/i.test(responseCode)) ||
      (response.status >= 400 && /woocommerce_rest_nonce_invalid/i.test(responseCode));

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
    return res.status(500).json({
      code: 'store_api_proxy_error',
      message: 'Failed to connect to WooCommerce Store API',
    });
  }
}

export default withRateLimitOnly(120, 60000)(handler);
