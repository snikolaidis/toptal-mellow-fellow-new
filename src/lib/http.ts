/**
 * Shared HTTP Request Utilities
 *
 * Centralized HTTP request helpers for API routes.
 * Uses Node.js native http/https modules for server-side requests.
 */

import http from 'http';
import https from 'https';

const keepAliveAgent = new https.Agent({ keepAlive: true });
const keepAliveAgentHttp = new http.Agent({ keepAlive: true });

// WooGraphQL session header name
export const WC_SESSION_HEADER = 'woocommerce-session';

// WooCommerce Store API cart-session header name. wp-graphql-woocommerce's
// `set_session_token_type` setting is set to 'both' (see woographql_settings),
// so it accepts/emits this same header alongside its own woocommerce-session
// one — letting GraphQL cart mutations (e.g. addBundleToCart) land in the
// exact WC session the Store API proxy (/api/store/*) reads right after,
// instead of a disconnected GraphQL-only session that the Store API never sees.
export const CART_TOKEN_HEADER = 'Cart-Token';

export interface HttpRequestOptions {
  url: string;
  body: string;
  cookies?: string;
  wcSessionToken?: string;
  cartToken?: string;
  authToken?: string;
  faustSecretKey?: string;
}

export interface HttpResponse {
  status: number;
  data: any;
  headers: http.IncomingHttpHeaders;
}

/**
 * Make an HTTP POST request using Node.js native modules
 */
export async function makeHttpRequest(options: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(options.body),
    };

    if (options.cookies) {
      headers['Cookie'] = options.cookies;
    }

    // Include WooCommerce session header if we have a token
    if (options.wcSessionToken) {
      headers[WC_SESSION_HEADER] = `Session ${options.wcSessionToken}`;
    }

    // Include the Store API cart token so this GraphQL request resolves to
    // the same WC session the Store API proxy uses.
    if (options.cartToken) {
      headers[CART_TOKEN_HEADER] = options.cartToken;
    }

    // Include Authorization header for authenticated users
    if (options.authToken) {
      headers['Authorization'] = `Bearer ${options.authToken}`;
    }

    // Include Faust.js secret key header for REST API authentication
    if (options.faustSecretKey) {
      headers['X-FaustWP-Secret'] = options.faustSecretKey;
    }

    const requestOptions: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers,
      agent: isHttps ? keepAliveAgent : keepAliveAgentHttp,
    };

    const req = lib.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode || 500,
            data: JSON.parse(data),
            headers: res.headers,
          });
        } catch {
          resolve({
            status: res.statusCode || 500,
            data: data,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', (error) => {
      console.error('HTTP request error:', error);
      reject(error);
    });

    req.write(options.body);
    req.end();
  });
}

/**
 * Make an HTTP GET request using Node.js native modules
 */
export async function makeHttpGetRequest(
  url: string,
  cookies?: string
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const headers: Record<string, string> = {};

    if (cookies) {
      headers['Cookie'] = cookies;
    }

    const requestOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers,
      agent: isHttps ? keepAliveAgent : keepAliveAgentHttp,
    };

    const req = lib.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode || 500,
            data: JSON.parse(data),
            headers: res.headers,
          });
        } catch {
          resolve({
            status: res.statusCode || 500,
            data: data,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', (error) => {
      console.error('HTTP GET request error:', error);
      reject(error);
    });

    req.end();
  });
}

/**
 * Extract WooCommerce session token from cookies
 */
export function extractWcSessionToken(cookies: string): string | null {
  const match = cookies.match(/wc_session_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Extract the Store API cart token from cookies. Same cookie the
 * /api/store/[...path].ts proxy reads/writes — sharing it here is what lets
 * a GraphQL cart mutation and the following Store API cart fetch agree on
 * the same WC session.
 */
export function extractCartToken(cookies: string): string | null {
  const match = cookies.match(/wc_cart_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Format a Set-Cookie header for the Store API cart token.
 */
export function createCartTokenCookie(token: string): string {
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `wc_cart_token=${encodeURIComponent(token)}; Path=/; HttpOnly; Expires=${expiry}; SameSite=Lax${secure}`;
}

/**
 * Build WordPress GraphQL URL from environment
 */
export function getWordPressGraphQLUrl(): string {
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const graphqlEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';
  return `${wordpressUrl}${graphqlEndpoint}`;
}

/**
 * Format a Set-Cookie header for the WooCommerce session token
 */
export function createWcSessionCookie(sessionToken: string): string {
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `wc_session_token=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Expires=${expiry}; SameSite=Lax${secure}`;
}

/**
 * Sanitize WordPress cookies for cross-domain usage
 * Removes Domain attribute so cookies are scoped to the frontend domain
 */
export function sanitizeCookies(cookies: string[]): string[] {
  return cookies.map((cookie) => {
    let modified = cookie
      .replace(/Domain=[^;]+;?\s*/gi, '')
      .replace(/SameSite=None/gi, 'SameSite=Lax')
      .replace(/SameSite=Strict/gi, 'SameSite=Lax');

    if (!modified.toLowerCase().includes('path=')) {
      modified += '; Path=/';
    }

    return modified;
  });
}
