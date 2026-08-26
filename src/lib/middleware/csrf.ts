/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * Stateless CSRF protection that doesn't require server-side token storage.
 *
 * Flow:
 * 1. Frontend calls GET /api/csrf-token
 * 2. Server generates a random token, sets it as an HttpOnly cookie AND returns it in the body
 * 3. Frontend stores the token in state, sends it as X-CSRF-Token header on mutations
 * 4. Server compares the header value against the cookie value (timing-safe)
 *
 * The token is NOT consumed after use — the same token works for the cookie's lifetime.
 * This eliminates the "security token refreshed" error that occurred with one-time-use tokens.
 */

import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import crypto from 'crypto';

export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_TTL = 60 * 60 * 1000;

export interface CsrfConfig {
  ttlMs?: number;
  headerName?: string;
  cookieName?: string;
  skipMethods?: string[];
}

function extractCookie(cookies: string, name: string): string | null {
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

export function withCsrf(config: CsrfConfig = {}) {
  const headerName = config.headerName ?? CSRF_HEADER;
  const cookieName = config.cookieName ?? CSRF_COOKIE;
  const skipMethods = config.skipMethods ?? ['GET', 'HEAD', 'OPTIONS'];

  return function csrfMiddleware(handler: NextApiHandler): NextApiHandler {
    return async function (req: NextApiRequest, res: NextApiResponse): Promise<void> {
      const method = req.method?.toUpperCase() || 'GET';

      if (skipMethods.includes(method)) {
        await handler(req, res);
        return;
      }

      const headerToken = req.headers[headerName];
      const cookieToken = extractCookie(req.headers.cookie || '', cookieName);

      if (
        typeof headerToken !== 'string' || !headerToken ||
        typeof cookieToken !== 'string' || !cookieToken
      ) {
        res.status(403).json({
          success: false,
          message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
          code: 'CSRF_INVALID',
        });
        return;
      }

      // Timing-safe comparison
      if (
        headerToken.length !== cookieToken.length ||
        !crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))
      ) {
        res.status(403).json({
          success: false,
          message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
          code: 'CSRF_INVALID',
        });
        return;
      }

      await handler(req, res);
    };
  };
}

export function createCsrfTokenHandler(config: CsrfConfig = {}) {
  const ttlMs = config.ttlMs ?? CSRF_TTL;
  const cookieName = config.cookieName ?? CSRF_COOKIE;

  return async function csrfTokenHandler(
    req: NextApiRequest,
    res: NextApiResponse
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.status(405).json({ message: 'Method not allowed' });
      return;
    }

    // Reuse existing token from cookie if present
    const existingToken = extractCookie(req.headers.cookie || '', cookieName);
    if (existingToken) {
      res.status(200).json({
        token: existingToken,
        expiresIn: Math.floor(ttlMs / 1000),
      });
      return;
    }

    // Generate new token and set as cookie
    const token = crypto.randomBytes(32).toString('hex');
    const maxAge = Math.floor(ttlMs / 1000);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
    );

    res.status(200).json({
      token,
      expiresIn: maxAge,
    });
  };
}

// Legacy exports for backward compatibility during transition
export function getSessionId(req: NextApiRequest, cookieName: string = CSRF_COOKIE): string {
  return extractCookie(req.headers.cookie || '', cookieName) || crypto.randomUUID();
}

export async function generateCsrfToken(sessionId: string, _ttlMs?: number): Promise<string> {
  return crypto.randomBytes(32).toString('hex');
}

export async function validateCsrf(req: NextApiRequest, headerName?: string, cookieName?: string): Promise<boolean> {
  const header = req.headers[headerName ?? CSRF_HEADER];
  const cookie = extractCookie(req.headers.cookie || '', cookieName ?? CSRF_COOKIE);
  if (typeof header !== 'string' || !header || typeof cookie !== 'string' || !cookie) return false;
  if (header.length !== cookie.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
}

export async function consumeCsrfToken(_token: string): Promise<boolean> {
  return true;
}

export function formatCsrfSessionCookie(
  sessionId: string,
  cookieName: string = CSRF_COOKIE,
  maxAge: number = 3600
): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${cookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
