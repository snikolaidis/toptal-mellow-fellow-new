/**
 * CSRF Token Generation Endpoint
 *
 * Generates a CSRF token for the current session.
 * Frontend should call this endpoint before making state-changing requests.
 *
 * GET /api/csrf-token
 * Returns: { token: string, expiresIn: number }
 */

import { createCsrfTokenHandler } from '@/lib/middleware/csrf';

export default createCsrfTokenHandler({
  ttlMs: 60 * 60 * 1000, // 1 hour
});
