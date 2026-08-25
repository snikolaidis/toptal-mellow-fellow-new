import type { NextApiRequest, NextApiResponse } from 'next';
import { extractRefreshToken } from '@/lib/jwt-auth';
import { refreshSession, clearAllAuthCookieHeaders } from '@/lib/session-manager';
import { withRateLimitOnly } from '@/lib/middleware';

const ACCESS_TTL = 15 * 60;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cookies = req.headers.cookie || '';
  const rawToken = extractRefreshToken(cookies);

  if (!rawToken) {
    res.setHeader('Set-Cookie', clearAllAuthCookieHeaders());
    return res.status(401).json({ success: false, message: 'No refresh token' });
  }

  const result = await refreshSession(rawToken, req);

  if (!result) {
    res.setHeader('Set-Cookie', clearAllAuthCookieHeaders());
    return res.status(401).json({ success: false, message: 'Session expired' });
  }

  res.setHeader('Set-Cookie', result.setCookieHeaders);
  return res.status(200).json({
    success: true,
    userId: result.userId,
    expiresIn: ACCESS_TTL,
  });
}

export default withRateLimitOnly(10)(handler);
