import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUserId } from '@/lib/faust-auth';
import { createSession } from '@/lib/session-manager';
import { withRateLimitOnly } from '@/lib/middleware';

const ACCESS_TTL = 2 * 60; // TESTING — revert to 15 * 60

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cookies = req.headers.cookie || '';

  try {
    const auth = await getAuthenticatedUserId(cookies);
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const session = await createSession(auth.userId, req);
    res.setHeader('Set-Cookie', session.setCookieHeaders);
    return res.status(200).json({
      success: true,
      userId: auth.userId,
      expiresIn: ACCESS_TTL,
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Token issuance failed' });
  }
}

export default withRateLimitOnly(5)(handler);
