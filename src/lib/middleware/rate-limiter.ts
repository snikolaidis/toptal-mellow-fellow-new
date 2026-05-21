/**
 * Rate Limiter Middleware
 *
 * Protects API endpoints from abuse by limiting requests per IP address.
 * Default: 5 requests per minute per IP+endpoint combination.
 */

import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getStorage } from '@/lib/storage';

export interface RateLimitConfig {
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs: number;
  /** Maximum attempts per window (default: 5) */
  maxAttempts: number;
  /** Custom key generator function */
  keyGenerator?: (req: NextApiRequest) => string;
  /** Custom error message */
  message?: string;
  /** Skip counting failed requests (default: false) */
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

const DEFAULT_CONFIG: Required<
  Pick<RateLimitConfig, 'windowMs' | 'maxAttempts' | 'message'>
> = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 5,
  message: 'Too many requests. Please try again later.',
};

/**
 * Extract client IP from request headers
 * Handles X-Forwarded-For for proxy/load balancer setups
 */
function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string') {
    // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
    // The first IP is the original client
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }

  // Fallback to socket remote address
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Default key generator: combines IP and endpoint path
 */
function defaultKeyGenerator(req: NextApiRequest): string {
  const ip = getClientIp(req);
  const endpoint = req.url?.split('?')[0] || '/unknown';
  return `rate:${ip}:${endpoint}`;
}

/**
 * Check rate limit for a request
 * Returns whether the request is allowed and remaining quota
 */
export async function checkRateLimit(
  req: NextApiRequest,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  const finalConfig = {
    windowMs: config.windowMs ?? DEFAULT_CONFIG.windowMs,
    maxAttempts: config.maxAttempts ?? DEFAULT_CONFIG.maxAttempts,
    keyGenerator: config.keyGenerator ?? defaultKeyGenerator,
  };

  const storage = await getStorage();
  const key = finalConfig.keyGenerator(req);

  const entry = await storage.incrementRateLimit(
    key,
    finalConfig.windowMs,
    finalConfig.maxAttempts
  );

  const allowed = entry.count <= finalConfig.maxAttempts;
  const remaining = Math.max(0, finalConfig.maxAttempts - entry.count);
  const retryAfter = allowed ? 0 : Math.ceil((entry.expiresAt - Date.now()) / 1000);

  return {
    allowed,
    remaining,
    resetAt: entry.expiresAt,
    retryAfter,
  };
}

/**
 * Set rate limit headers on response
 */
function setRateLimitHeaders(
  res: NextApiResponse,
  config: { maxAttempts: number },
  result: RateLimitResult
): void {
  res.setHeader('X-RateLimit-Limit', config.maxAttempts);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter);
  }
}

/**
 * Higher-order function that wraps an API handler with rate limiting
 *
 * @example
 * export default withRateLimit({ maxAttempts: 10 })(handler);
 */
export function withRateLimit(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = {
    windowMs: config.windowMs ?? DEFAULT_CONFIG.windowMs,
    maxAttempts: config.maxAttempts ?? DEFAULT_CONFIG.maxAttempts,
    message: config.message ?? DEFAULT_CONFIG.message,
    keyGenerator: config.keyGenerator ?? defaultKeyGenerator,
  };

  return function rateLimitMiddleware(handler: NextApiHandler): NextApiHandler {
    return async function (
      req: NextApiRequest,
      res: NextApiResponse
    ): Promise<void> {
      try {
        const result = await checkRateLimit(req, finalConfig);

        // Set rate limit headers on all responses
        setRateLimitHeaders(res, finalConfig, result);

        if (!result.allowed) {
          res.status(429).json({
            success: false,
            message: finalConfig.message,
            code: 'RATE_LIMITED',
            retryAfter: result.retryAfter,
          });
          return;
        }

        // Request is allowed, proceed to handler
        await handler(req, res);
        return;
      } catch (error) {
        // If rate limiting fails, allow the request but log the error
        console.error('Rate limiting error:', error);
        await handler(req, res);
        return;
      }
    };
  };
}

/**
 * Create a rate limit key for payment endpoints
 * More restrictive: based on IP only (not endpoint)
 */
export function paymentRateLimitKeyGenerator(req: NextApiRequest): string {
  const ip = getClientIp(req);
  return `rate:payment:${ip}`;
}

/**
 * Pre-configured rate limiter for payment endpoints
 * 5 attempts per minute per IP across all payment endpoints
 */
export function withPaymentRateLimit() {
  return withRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 5,
    keyGenerator: paymentRateLimitKeyGenerator,
    message: 'Too many payment attempts. Please wait a minute before trying again.',
  });
}
