import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyJwt, extractJwt } from '@/lib/jwt-auth';
import { getAuthenticatedUserId } from '@/lib/faust-auth';
import { validateSession, createSession } from '@/lib/session-manager';
import { withRateLimitOnly } from '@/lib/middleware';

const ACCESS_TTL = 15 * 60;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store');

  const cookies = req.headers.cookie || '';

  const token = extractJwt(cookies);
  if (token) {
    const result = verifyJwt(token);
    if (result) {
      const sessionValid = await validateSession(result.sessionId);
      if (!sessionValid) {
        return res.status(200).json({ authenticated: false, userId: null });
      }
      const expiresIn = result.exp - Math.floor(Date.now() / 1000);
      return res.status(200).json({
        authenticated: true,
        userId: result.userId,
        expiresIn,
      });
    }
  }

  try {
    const auth = await getAuthenticatedUserId(cookies);
    if (auth) {
      const session = await createSession(auth.userId, req);
      res.setHeader('Set-Cookie', session.setCookieHeaders);
      return res.status(200).json({
        authenticated: true,
        userId: auth.userId,
        expiresIn: ACCESS_TTL,
      });
    }
  } catch {
    // Faust exchange failed
  }

  return res.status(200).json({ authenticated: false, userId: null });
}

export default withRateLimitOnly(60)(handler);
