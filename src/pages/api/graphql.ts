import type { NextApiRequest, NextApiResponse } from 'next';
import {
  makeHttpRequest,
  extractWcSessionToken,
  createWcSessionCookie,
  sanitizeCookies,
  WC_SESSION_HEADER,
} from '@/lib/http';
import { withRateLimitOnly } from '@/lib/middleware';

/**
 * GraphQL Proxy API Route
 *
 * Proxies GraphQL requests to WordPress to avoid CORS issues.
 * Rate limited to 60 requests per minute per IP.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const graphqlEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';
  const url = `${wordpressUrl}${graphqlEndpoint}`;

  try {
    const cookies = req.headers.cookie || '';
    const wcSessionToken = extractWcSessionToken(cookies);

    let response = await makeHttpRequest({
      url,
      body: JSON.stringify(req.body),
      cookies,
      wcSessionToken: wcSessionToken || undefined,
    });

    const cookiesToSet: string[] = [];

    const hasSignatureError =
      !!wcSessionToken &&
      response.data &&
      Array.isArray(response.data.errors) &&
      response.data.errors.some(
        (e: { message?: string }) =>
          typeof e?.message === 'string' &&
          e.message.toLowerCase().includes('signature verification failed')
      );

    if (hasSignatureError) {
      const strippedCookies = cookies
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c && !c.toLowerCase().startsWith('wc_session_token='))
        .join('; ');

      response = await makeHttpRequest({
        url,
        body: JSON.stringify(req.body),
        cookies: strippedCookies,
      });

      cookiesToSet.push('wc_session_token=; Path=/; Max-Age=0; SameSite=Lax');
    }

    const data = response.data;

    // Handle WooCommerce session header from WordPress
    const wcSessionHeader = response.headers[WC_SESSION_HEADER.toLowerCase()] as string | undefined;
    if (wcSessionHeader) {
      let sessionToken = wcSessionHeader;
      const tokenMatch = wcSessionHeader.match(/Session\s+(.+)/i);
      if (tokenMatch) {
        sessionToken = tokenMatch[1];
      }

      cookiesToSet.push(createWcSessionCookie(sessionToken));
    }

    // Forward any cookies from WordPress
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader && Array.isArray(setCookieHeader)) {
      const sanitizedCookies = sanitizeCookies(setCookieHeader);
      cookiesToSet.push(...sanitizedCookies);
    }

    if (cookiesToSet.length > 0) {
      res.setHeader('Set-Cookie', cookiesToSet);
    }

    return res.status(response.status).json(data);
  } catch (error) {
    console.error('GraphQL proxy error');
    return res.status(500).json({
      errors: [{ message: 'Failed to connect to WordPress GraphQL endpoint' }],
    });
  }
}

export default withRateLimitOnly(60, 60000)(handler);
