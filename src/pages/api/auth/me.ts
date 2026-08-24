import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyJwt, extractJwt, jwtCookieHeader, signJwt } from '@/lib/jwt-auth';
import { exchangeRefreshToken, getAuthenticatedUserId } from '@/lib/faust-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store');

  const cookies = req.headers.cookie || '';

  // Fast path: verify JWT locally (no network call)
  const token = extractJwt(cookies);
  if (token) {
    const result = verifyJwt(token);
    if (result) {
      return res.status(200).json({ authenticated: true, userId: result.userId });
    }
  }

  // Fallback: exchange Faust refresh token (for users who logged in before JWT rollout)
  try {
    const auth = await getAuthenticatedUserId(cookies);
    if (auth) {
      // Issue JWT retroactively so subsequent requests use the fast path
      const jwt = signJwt(auth.userId);
      res.setHeader('Set-Cookie', jwtCookieHeader(jwt));
      return res.status(200).json({ authenticated: true, userId: auth.userId });
    }
  } catch {
    // Faust exchange failed — not authenticated
  }

  return res.status(200).json({ authenticated: false, userId: null });
}
