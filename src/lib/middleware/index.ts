/**
 * Middleware Index
 *
 * Central export for all middleware and composition utilities.
 * Provides pre-configured middleware stacks for common use cases.
 */

import type { NextApiHandler } from 'next';

// Re-export all middleware
export * from './rate-limiter';
export * from './idempotency';
export * from './csrf';

// Import for composition
import { withRateLimit, withPaymentRateLimit } from './rate-limiter';
import { withIdempotency } from './idempotency';
import { withCsrf } from './csrf';

/**
 * Middleware type for composition
 */
type Middleware = (handler: NextApiHandler) => NextApiHandler;

/**
 * Compose multiple middleware functions into a single wrapper
 *
 * Middleware is applied right-to-left, meaning the first middleware
 * in the array is the outermost (runs first on request, last on response).
 *
 * @example
 * const protected = withMiddleware(
 *   withCsrf(),      // Runs first
 *   withRateLimit(), // Runs second
 *   withIdempotency() // Runs third (closest to handler)
 * );
 * export default protected(handler);
 */
export function withMiddleware(...middlewares: Middleware[]) {
  return function composedMiddleware(handler: NextApiHandler): NextApiHandler {
    return middlewares.reduceRight(
      (acc, middleware) => middleware(acc),
      handler
    );
  };
}

/**
 * Pre-configured middleware stack for payment/checkout endpoints
 *
 * Applies in order:
 * 1. CSRF validation (rejects invalid tokens)
 * 2. Rate limiting (5 req/min per IP for payment)
 * 3. Idempotency (prevents duplicate processing)
 *
 * @example
 * // In pages/api/checkout.ts
 * export default withPaymentProtection()(handler);
 */
export function withPaymentProtection() {
  return withMiddleware(
    withCsrf(),
    withPaymentRateLimit(),
    withIdempotency({ required: true })
  );
}

/**
 * Pre-configured middleware for standard API endpoints
 * Less restrictive than payment protection
 *
 * Applies:
 * 1. CSRF validation
 * 2. General rate limiting (60 req/min)
 */
export function withApiProtection() {
  return withMiddleware(
    withCsrf(),
    withRateLimit({
      windowMs: 60 * 1000,
      maxAttempts: 60,
    })
  );
}

/**
 * Rate limiting only (no CSRF or idempotency)
 * Useful for public endpoints that don't need CSRF
 */
export function withRateLimitOnly(maxAttempts: number = 30, windowMs: number = 60000) {
  return withRateLimit({ maxAttempts, windowMs });
}
