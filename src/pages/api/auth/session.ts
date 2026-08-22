import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    const session = await getSession(req, res);

    if (!session.userId) {
      return res.status(200).json({
        isAuthenticated: false,
      });
    }

    return res.status(200).json({
      isAuthenticated: true,
      userId: session.userId,
    });
  } catch (error) {
    console.error('Session check failed:', error);

    return res.status(500).json({
      isAuthenticated: false,
      error: 'Unable to check session',
    });
  }
}