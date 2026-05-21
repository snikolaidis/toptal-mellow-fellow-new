import type { NextApiRequest, NextApiResponse } from 'next';
import {
  makeHttpRequest,
  extractWcSessionToken,
  createWcSessionCookie,
  sanitizeCookies,
  WC_SESSION_HEADER,
} from '@/lib/http';

/**
 * GraphQL Proxy API Route
 *
 * Proxies GraphQL requests to WordPress to avoid CORS issues.
 * The browser makes requests to /api/graphql, which then forwards
 * them to the WordPress GraphQL endpoint.
 *
 * Security:
 * - Only forwards to the configured WordPress URL (not arbitrary URLs)
 * - Forwards session cookies and woocommerce-session header for cart persistence
 * - Can be replaced with direct WordPress CORS config in production
 */

export default async function handler(
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

    console.log('GraphQL Proxy - WC Session Token:', wcSessionToken ? `present (${wcSessionToken.substring(0, 20)}...)` : 'none');

    const response = await makeHttpRequest({
      url,
      body: JSON.stringify(req.body),
      cookies,
      wcSessionToken: wcSessionToken || undefined,
    });

    const data = response.data;
    const cookiesToSet: string[] = [];

    // Handle WooCommerce session header from WordPress
    const wcSessionHeader = response.headers[WC_SESSION_HEADER.toLowerCase()] as string | undefined;
    if (wcSessionHeader) {
      console.log('GraphQL Proxy - WC Session header from WP:', wcSessionHeader.substring(0, 50));

      let sessionToken = wcSessionHeader;
      const tokenMatch = wcSessionHeader.match(/Session\s+(.+)/i);
      if (tokenMatch) {
        sessionToken = tokenMatch[1];
      }

      cookiesToSet.push(createWcSessionCookie(sessionToken));
      console.log('GraphQL Proxy - Session token stored');
    }

    // Forward any cookies from WordPress
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader && Array.isArray(setCookieHeader)) {
      console.log('GraphQL Proxy - Raw cookies from WordPress:', setCookieHeader.length);
      const sanitizedCookies = sanitizeCookies(setCookieHeader);
      cookiesToSet.push(...sanitizedCookies);
    }

    if (cookiesToSet.length > 0) {
      console.log('GraphQL Proxy - Setting cookies:', cookiesToSet.length);
      res.setHeader('Set-Cookie', cookiesToSet);
    }

    return res.status(response.status).json(data);
  } catch (error) {
    console.error('GraphQL proxy error:', error);
    return res.status(500).json({
      errors: [{ message: 'Failed to connect to WordPress GraphQL endpoint' }],
    });
  }
}
