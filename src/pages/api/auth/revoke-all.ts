import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyJwt, extractJwt } from '@/lib/jwt-auth';
import { revokeAllSessions, clearAllAuthCookieHeaders } from '@/lib/session-manager';
import { withRateLimitOnly } from '@/lib/middleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cookies = req.headers.cookie || '';
  const token = extractJwt(cookies);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const result = verifyJwt(token);
  if (!result) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  await revokeAllSessions(result.userId);

  res.setHeader('Set-Cookie', clearAllAuthCookieHeaders());
  return res.status(200).json({ success: true });
}

export default withRateLimitOnly(3)(handler);
