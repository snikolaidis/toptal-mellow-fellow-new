import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUserId, exchangeAuthCode } from '@/lib/faust-auth';
import { createSession } from '@/lib/session-manager';
import { withRateLimitOnly } from '@/lib/middleware';

const ACCESS_TTL = 15 * 60;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    let userId: number | null = null;

    const { code } = req.body || {};
    if (code) {
      const result = await exchangeAuthCode(code);
      if (result) userId = result.userId;
    }

    if (!userId) {
      const cookies = req.headers.cookie || '';
      const auth = await getAuthenticatedUserId(cookies);
      if (auth) userId = auth.userId;
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const session = await createSession(userId, req);
    res.setHeader('Set-Cookie', session.setCookieHeaders);
    return res.status(200).json({
      success: true,
      userId,
      expiresIn: ACCESS_TTL,
    });
  } catch (err) {
    console.error('[auth/jwt] Token issuance failed:', err);
    return res.status(500).json({ success: false, message: 'Token issuance failed' });
  }
}

export default withRateLimitOnly(5)(handler);
