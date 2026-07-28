import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'https';
import http from 'http';
import { withRateLimitOnly } from '@/lib/middleware';
import { makeHttpGetRequest } from '@/lib/http';

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

async function getAuthToken(req: NextApiRequest): Promise<string | null> {
  const cookies = req.headers.cookie || '';
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

  const wpHost = new URL(wordpressUrl).host.replace(/[^a-zA-Z0-9.-]/g, '');
  const rtCookiePattern = new RegExp(`https?${wpHost}-rt=([^;]+)`);
  if (!rtCookiePattern.test(cookies)) return null;

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost:3001';
    const tokenUrl = `${protocol}://${host}/api/faust/auth/token`;
    const tokenResponse = await makeHttpGetRequest(tokenUrl, cookies);
    return tokenResponse.data?.accessToken || null;
  } catch {
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const storePath = Array.isArray(path) ? path.join('/') : path || '';

  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const storeApiUrl = `${wordpressUrl}/wp-json/wc/store/v1/${storePath}`;

  const cookies = req.headers.cookie || '';
  const cartToken = extractCartToken(cookies);

  const authToken = await getAuthToken(req);

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

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  } else if (cartToken) {
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

      proxyReq.on('error', reject);

      if (bodyStr) {
        proxyReq.write(bodyStr);
      }
      proxyReq.end();
    });

    const cookiesToSet: string[] = [];

    const newCartToken = response.headers['cart-token'] as string | undefined;
    if (newCartToken && !authToken) {
      cookiesToSet.push(createCartTokenCookie(newCartToken));
    }

    const isSessionDead =
      response.status === 403 ||
      (response.status >= 400 && typeof response.data?.code === 'string' &&
        /nonce|woocommerce_rest_cart_invalid_key/i.test(response.data.code));

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

export default withRateLimitOnly(60, 60000)(handler);
