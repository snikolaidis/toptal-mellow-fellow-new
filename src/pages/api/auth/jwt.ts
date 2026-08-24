import type { NextApiRequest, NextApiResponse } from 'next';
import { signJwt, jwtCookieHeader } from '@/lib/jwt-auth';
import { getAuthenticatedUserId } from '@/lib/faust-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cookies = req.headers.cookie || '';

  try {
    const auth = await getAuthenticatedUserId(cookies);
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const jwt = signJwt(auth.userId);
    res.setHeader('Set-Cookie', jwtCookieHeader(jwt));
    return res.status(200).json({ success: true, userId: auth.userId });
  } catch {
    return res.status(500).json({ success: false, message: 'Token issuance failed' });
  }
}
