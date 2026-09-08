import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSideAuth } from '@/lib/server-auth';
import { extractJwt, verifyJwt } from '@/lib/jwt-auth';
import { validateSession } from '@/lib/session-manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      authenticated: false,
    });
  }

  try {
    const token = extractJwt(req.headers.cookie || '');
    if (token) {
      const jwt = verifyJwt(token);
      if (jwt && await validateSession(jwt.sessionId)) {
        return res.status(200).json({
          authenticated: true,
          userId: jwt.userId,
        });
      }
    }

    const auth = await getServerSideAuth({
      req,
      res,
    } as any);

    return res.status(200).json({
      authenticated: !!auth,
    });
  } catch {
    return res.status(200).json({
      authenticated: false,
    });
  }
}