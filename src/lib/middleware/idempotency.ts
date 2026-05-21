/**
 * Idempotency Middleware
 *
 * Prevents duplicate request processing by tracking requests via idempotency keys.
 * If the same key is seen again, returns the cached response.
 * Protects against network retries and accidental double-clicks.
 */

import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getStorage, IdempotencyEntry } from '@/lib/storage';

/** Header name for idempotency key */
export const IDEMPOTENCY_HEADER = 'x-idempotency-key';

/** Default TTL for idempotency entries: 24 hours */
export const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000;

export interface IdempotencyResult {
  /** Whether this is a new request (not seen before) */
  isNew: boolean;
  /** The existing entry if request was seen before */
  entry?: IdempotencyEntry;
}

export interface IdempotencyConfig {
  /** TTL in milliseconds for idempotency entries (default: 24 hours) */
  ttlMs?: number;
  /** Whether idempotency key is required (default: false) */
  required?: boolean;
  /** Custom header name (default: x-idempotency-key) */
  headerName?: string;
}

/**
 * Get the idempotency key from request headers
 */
export function getIdempotencyKey(
  req: NextApiRequest,
  headerName: string = IDEMPOTENCY_HEADER
): string | null {
  const key = req.headers[headerName];
  if (typeof key === 'string' && key.length > 0) {
    return key;
  }
  return null;
}

/**
 * Check if a request has already been processed
 */
export async function checkIdempotency(
  req: NextApiRequest,
  headerName: string = IDEMPOTENCY_HEADER
): Promise<IdempotencyResult> {
  const key = getIdempotencyKey(req, headerName);

  if (!key) {
    return { isNew: true };
  }

  const storage = await getStorage();
  const existing = await storage.getIdempotencyEntry(key);

  if (!existing) {
    return { isNew: true };
  }

  return { isNew: false, entry: existing };
}

/**
 * Create a new idempotency entry for tracking
 */
export async function createIdempotencyEntry(
  req: NextApiRequest,
  ttlMs: number = IDEMPOTENCY_TTL,
  headerName: string = IDEMPOTENCY_HEADER
): Promise<string | null> {
  const key = getIdempotencyKey(req, headerName);

  if (!key) {
    return null;
  }

  const storage = await getStorage();
  await storage.createIdempotencyEntry({
    key,
    status: 'processing',
    expiresAt: Date.now() + ttlMs,
  });

  return key;
}

/**
 * Mark an idempotency entry as completed with the response
 */
export async function completeIdempotency(
  key: string,
  response: object,
  orderId?: string,
  transactionId?: string
): Promise<void> {
  const storage = await getStorage();
  await storage.updateIdempotencyEntry(key, {
    status: 'completed',
    response: JSON.stringify(response),
    orderId,
    transactionId,
  });
}

/**
 * Mark an idempotency entry as failed with the error response
 */
export async function failIdempotency(
  key: string,
  response: object
): Promise<void> {
  const storage = await getStorage();
  await storage.updateIdempotencyEntry(key, {
    status: 'failed',
    response: JSON.stringify(response),
  });
}

/**
 * Higher-order function that wraps an API handler with idempotency protection
 *
 * If a request with the same idempotency key is received:
 * - If processing: Returns 409 Conflict
 * - If completed: Returns cached success response with X-Idempotency-Replay header
 * - If failed: Returns cached error response with X-Idempotency-Replay header
 *
 * @example
 * export default withIdempotency({ required: true })(handler);
 */
export function withIdempotency(config: IdempotencyConfig = {}) {
  const headerName = config.headerName ?? IDEMPOTENCY_HEADER;
  const required = config.required ?? false;

  return function idempotencyMiddleware(
    handler: NextApiHandler
  ): NextApiHandler {
    return async function (
      req: NextApiRequest,
      res: NextApiResponse
    ): Promise<void> {
      const key = getIdempotencyKey(req, headerName);

      // Check if idempotency key is required
      if (required && !key) {
        res.status(400).json({
          success: false,
          message: `Idempotency key is required. Include ${headerName} header.`,
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        });
        return;
      }

      // If no key provided, just proceed (opt-in idempotency)
      if (!key) {
        await handler(req, res);
        return;
      }

      try {
        const result = await checkIdempotency(req, headerName);

        if (!result.isNew && result.entry) {
          const entry = result.entry;

          // Request is currently being processed
          if (entry.status === 'processing') {
            res.status(409).json({
              success: false,
              message: 'This request is already being processed. Please wait.',
              code: 'IDEMPOTENCY_CONFLICT',
              idempotencyKey: key,
            });
            return;
          }

          // Request was previously completed or failed - return cached response
          if (entry.response) {
            const cached = JSON.parse(entry.response);
            res.setHeader('X-Idempotency-Replay', 'true');
            res.setHeader('X-Idempotency-Key', key);

            // Use appropriate status code based on original result
            const statusCode = entry.status === 'completed' ? 200 : 400;
            res.status(statusCode).json(cached);
            return;
          }
        }

        // New request - proceed to handler
        await handler(req, res);
        return;
      } catch (error) {
        // If idempotency check fails, allow the request but log the error
        console.error('Idempotency check error:', error);
        await handler(req, res);
        return;
      }
    };
  };
}

/**
 * Utility to wrap async handler with idempotency tracking
 * Use this when you need manual control over the idempotency lifecycle
 *
 * @example
 * const key = await startIdempotencyTracking(req, res, { required: true });
 * if (!key && config.required) return; // Response already sent
 *
 * try {
 *   const result = await doSomething();
 *   await completeIdempotency(key!, result);
 *   res.json(result);
 * } catch (error) {
 *   await failIdempotency(key!, { error: error.message });
 *   res.status(500).json({ error: error.message });
 * }
 */
export async function startIdempotencyTracking(
  req: NextApiRequest,
  res: NextApiResponse,
  config: IdempotencyConfig = {}
): Promise<string | null> {
  const headerName = config.headerName ?? IDEMPOTENCY_HEADER;
  const ttlMs = config.ttlMs ?? IDEMPOTENCY_TTL;
  const required = config.required ?? false;

  const key = getIdempotencyKey(req, headerName);

  // Check if required
  if (required && !key) {
    res.status(400).json({
      success: false,
      message: `Idempotency key is required. Include ${headerName} header.`,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    return null;
  }

  if (!key) {
    return null;
  }

  // Check for existing entry
  const result = await checkIdempotency(req, headerName);

  if (!result.isNew && result.entry) {
    const entry = result.entry;

    if (entry.status === 'processing') {
      res.status(409).json({
        success: false,
        message: 'This request is already being processed.',
        code: 'IDEMPOTENCY_CONFLICT',
        idempotencyKey: key,
      });
      return null;
    }

    if (entry.response) {
      const cached = JSON.parse(entry.response);
      res.setHeader('X-Idempotency-Replay', 'true');
      const statusCode = entry.status === 'completed' ? 200 : 400;
      res.status(statusCode).json(cached);
      return null;
    }
  }

  // Create new tracking entry
  await createIdempotencyEntry(req, ttlMs, headerName);
  return key;
}
