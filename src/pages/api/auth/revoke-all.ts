import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyJwt, extractJwt, extractRefreshToken } from '@/lib/jwt-auth';
import { revokeAllSessions, clearAllAuthCookieHeaders } from '@/lib/session-manager';
import { withRateLimitOnly } from '@/lib/middleware';
import { getStorage } from '@/lib/storage';
import crypto from 'crypto';

async function getUserId(cookies: string): Promise<number | null> {
  const token = extractJwt(cookies);
  if (token) {
    const result = verifyJwt(token);
    if (result) return result.userId;
  }

  const refreshToken = extractRefreshToken(cookies);
  if (refreshToken) {
    const storage = await getStorage();
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await storage.getAuthSessionByRefreshTokenHash(hash);
    if (session && !session.revoked) return session.userId;
  }

  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cookies = req.headers.cookie || '';
  const userId = await getUserId(cookies);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  await revokeAllSessions(userId);

  res.setHeader('Set-Cookie', clearAllAuthCookieHeaders());
  return res.status(200).json({ success: true });
}

export default withRateLimitOnly(3)(handler);
