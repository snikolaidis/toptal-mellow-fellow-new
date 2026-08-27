import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'graphql';
import type { ASTNode, SelectionSetNode } from 'graphql';
import {
  makeHttpRequest,
  extractWcSessionToken,
  createWcSessionCookie,
  extractCartToken,
  createCartTokenCookie,
  sanitizeCookies,
  WC_SESSION_HEADER,
  CART_TOKEN_HEADER,
} from '@/lib/http';
import { withRateLimitOnly } from '@/lib/middleware';

const MAX_DEPTH = 10;
const MAX_ALIASES = 50;
const MAX_BATCH = 10;

function selectionSetDepth(selectionSet: SelectionSetNode): number {
  let deepest = 0;
  for (const selection of selectionSet.selections) {
    if ('selectionSet' in selection && selection.selectionSet) {
      const childDepth = selectionSetDepth(selection.selectionSet);
      if (childDepth > deepest) {
        deepest = childDepth;
      }
    }
  }
  return deepest + 1;
}

function countAliases(node: ASTNode): number {
  let count = 0;
  if ('alias' in node && node.alias) {
    count += 1;
  }
  if ('selectionSet' in node && node.selectionSet) {
    for (const selection of node.selectionSet.selections) {
      count += countAliases(selection);
    }
  }
  if ('definitions' in node && Array.isArray(node.definitions)) {
    for (const definition of node.definitions) {
      count += countAliases(definition);
    }
  }
  return count;
}

function exceedsComplexity(query: unknown): boolean {
  if (typeof query !== 'string' || query.length === 0) {
    return false;
  }
  if (query.length < 3000) return false;
  const document = parse(query);
  let aliases = 0;
  for (const definition of document.definitions) {
    if (definition.kind === 'OperationDefinition' || definition.kind === 'FragmentDefinition') {
      if (selectionSetDepth(definition.selectionSet) > MAX_DEPTH) {
        return true;
      }
    }
    aliases += countAliases(definition);
  }
  return aliases > MAX_ALIASES;
}

function isAbusivePayload(body: unknown): boolean {
  try {
    if (Array.isArray(body)) {
      if (body.length > MAX_BATCH) {
        return true;
      }
      return body.some((entry) => exceedsComplexity(entry?.query));
    }
    if (body && typeof body === 'object') {
      return exceedsComplexity((body as { query?: unknown }).query);
    }
    return false;
  } catch {
    return false;
  }
}

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

  if (isAbusivePayload(req.body)) {
    return res.status(400).json({
      errors: [{ message: 'Query exceeds allowed complexity' }],
    });
  }

  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const graphqlEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';
  const url = `${wordpressUrl}${graphqlEndpoint}`;

  try {
    const cookies = req.headers.cookie || '';
    const wcSessionToken = extractWcSessionToken(cookies);
    const cartToken = extractCartToken(cookies);

    let response = await makeHttpRequest({
      url,
      body: JSON.stringify(req.body),
      cookies,
      wcSessionToken: wcSessionToken || undefined,
      cartToken: cartToken || undefined,
    });

    const cookiesToSet: string[] = [];

    // wp-graphql-woocommerce reports a bad token as a UserError whose message
    // is "{error_code}: {message}" — 'invalid_token: Signature verification
    // failed' for the legacy woocommerce-session JWT, 'invalid_cart_token:
    // Invalid Cart-Token' for the Store API Cart-Token (see
    // QL_Session_Handler::validate_legacy_token / validate_cart_token). These
    // are two independent tokens/cookies, so a bad one doesn't imply the
    // other is bad too — check and clear each separately rather than wiping
    // both cookies (and discarding a perfectly good cart) whenever only one
    // of them is actually stale/corrupted.
    const responseErrors: Array<{ message?: string }> = Array.isArray(response.data?.errors)
      ? response.data.errors
      : [];

    const hasSessionTokenError =
      !!wcSessionToken &&
      responseErrors.some(
        (e) => typeof e?.message === 'string' && e.message.toLowerCase().includes('signature verification failed')
      );

    const hasCartTokenError =
      !!cartToken &&
      responseErrors.some(
        (e) => typeof e?.message === 'string' && e.message.toLowerCase().includes('invalid_cart_token')
      );

    if (hasSessionTokenError || hasCartTokenError) {
      const strippedCookies = cookies
        .split(';')
        .map((c) => c.trim())
        .filter((c) => {
          if (!c) return false;
          const lower = c.toLowerCase();
          if (hasSessionTokenError && lower.startsWith('wc_session_token=')) return false;
          if (hasCartTokenError && lower.startsWith('wc_cart_token=')) return false;
          return true;
        })
        .join('; ');

      response = await makeHttpRequest({
        url,
        body: JSON.stringify(req.body),
        cookies: strippedCookies,
      });

      if (hasSessionTokenError) {
        cookiesToSet.push('wc_session_token=; Path=/; Max-Age=0; SameSite=Lax');
      }
      if (hasCartTokenError) {
        cookiesToSet.push('wc_cart_token=; Path=/; Max-Age=0; SameSite=Lax');
      }
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

    // Handle the Store API cart token, when wp-graphql-woocommerce issues one
    // (set_session_token_type: 'both') — keeps this session addressable by
    // the Store API proxy too, e.g. right after an addBundleToCart mutation.
    const cartTokenHeader = response.headers[CART_TOKEN_HEADER.toLowerCase()] as string | undefined;
    if (cartTokenHeader) {
      cookiesToSet.push(createCartTokenCookie(cartTokenHeader));
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
