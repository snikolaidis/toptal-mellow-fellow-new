/**
 * CSRF Protection Middleware
 *
 * Protects against Cross-Site Request Forgery attacks by requiring
 * a valid CSRF token for state-changing requests (POST, PUT, DELETE, PATCH).
 *
 * Flow:
 * 1. Frontend fetches CSRF token via GET /api/csrf-token
 * 2. Frontend includes token in X-CSRF-Token header for mutations
 * 3. Backend validates token matches session and hasn't been used
 * 4. Token is consumed (one-time use) after validation
 */

import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import crypto from 'crypto';
import { getStorage } from '@/lib/storage';

/** Header name for CSRF token */
export const CSRF_HEADER = 'x-csrf-token';

/** Cookie name for CSRF session */
export const CSRF_COOKIE = 'csrf_session';

/** Default TTL for CSRF tokens: 1 hour */
export const CSRF_TTL = 60 * 60 * 1000;

export interface CsrfConfig {
  /** TTL in milliseconds for CSRF tokens (default: 1 hour) */
  ttlMs?: number;
  /** Custom header name (default: x-csrf-token) */
  headerName?: string;
  /** Custom cookie name (default: csrf_session) */
  cookieName?: string;
  /** Methods to skip CSRF check (default: ['GET', 'HEAD', 'OPTIONS']) */
  skipMethods?: string[];
}

/**
 * Get or create a session ID for CSRF tracking
 */
export function getSessionId(
  req: NextApiRequest,
  cookieName: string = CSRF_COOKIE
): string {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(new RegExp(`${cookieName}=([^;]+)`));

  if (match) {
    return match[1];
  }

  // Generate new session ID
  return crypto.randomUUID();
}

/**
 * Generate a new CSRF token for a session
 */
export async function generateCsrfToken(
  sessionId: string,
  ttlMs: number = CSRF_TTL
): Promise<string> {
  const storage = await getStorage();
  const entry = await storage.createCsrfToken(sessionId, ttlMs);
  return entry.token;
}

/**
 * Validate a CSRF token against a session
 */
export async function validateCsrf(
  req: NextApiRequest,
  headerName: string = CSRF_HEADER,
  cookieName: string = CSRF_COOKIE
): Promise<boolean> {
  const token = req.headers[headerName];
  const sessionId = getSessionId(req, cookieName);

  if (typeof token !== 'string' || !token) {
    return false;
  }

  if (!sessionId) {
    return false;
  }

  const storage = await getStorage();
  return storage.validateCsrfToken(token, sessionId);
}

/**
 * Consume a CSRF token (mark as used)
 */
export async function consumeCsrfToken(token: string): Promise<boolean> {
  const storage = await getStorage();
  return storage.consumeCsrfToken(token);
}

/**
 * Format Set-Cookie header for CSRF session
 */
export function formatCsrfSessionCookie(
  sessionId: string,
  cookieName: string = CSRF_COOKIE,
  maxAge: number = 3600
): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${cookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/**
 * Higher-order function that wraps an API handler with CSRF protection
 *
 * Skips validation for safe methods (GET, HEAD, OPTIONS).
 * For other methods, requires valid X-CSRF-Token header.
 *
 * @example
 * export default withCsrf()(handler);
 */
export function withCsrf(config: CsrfConfig = {}) {
  const headerName = config.headerName ?? CSRF_HEADER;
  const cookieName = config.cookieName ?? CSRF_COOKIE;
  const skipMethods = config.skipMethods ?? ['GET', 'HEAD', 'OPTIONS'];

  return function csrfMiddleware(handler: NextApiHandler): NextApiHandler {
    return async function (
      req: NextApiRequest,
      res: NextApiResponse
    ): Promise<void> {
      const method = req.method?.toUpperCase() || 'GET';

      // Skip CSRF check for safe methods
      if (skipMethods.includes(method)) {
        await handler(req, res);
        return;
      }

      try {
        // Validate CSRF token
        const isValid = await validateCsrf(req, headerName, cookieName);

        if (!isValid) {
          res.status(403).json({
            success: false,
            message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
            code: 'CSRF_INVALID',
          });
          return;
        }

        // Consume the token (one-time use)
        const token = req.headers[headerName] as string;
        await consumeCsrfToken(token);

        // Proceed to handler
        await handler(req, res);
        return;
      } catch (error) {
        console.error('CSRF validation error:', error);
        res.status(403).json({
          success: false,
          message: 'CSRF validation failed. Please refresh the page and try again.',
          code: 'CSRF_INVALID',
        });
        return;
      }
    };
  };
}

/**
 * Create a CSRF token response handler
 * Use this to implement the GET /api/csrf-token endpoint
 *
 * @example
 * // In pages/api/csrf-token.ts
 * export default createCsrfTokenHandler();
 */
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

    try {
      // Get or create session ID
      let sessionId = getSessionId(req, cookieName);
      const existingCookie = req.headers.cookie?.includes(`${cookieName}=`);

      // Set session cookie if not present
      if (!existingCookie) {
        sessionId = crypto.randomUUID();
        res.setHeader('Set-Cookie', formatCsrfSessionCookie(sessionId, cookieName));
      }

      // Generate new CSRF token
      const token = await generateCsrfToken(sessionId, ttlMs);

      res.status(200).json({
        token,
        expiresIn: Math.floor(ttlMs / 1000),
      });
    } catch (error) {
      console.error('CSRF token generation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate security token. Please try again.',
      });
    }
  };
}
