import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { clearAllAuthCookieHeaders } from '@/lib/session-manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
    });
  }

  try {
    const session = await getSession(req, res);
    session.destroy();
    res.setHeader('Set-Cookie', clearAllAuthCookieHeaders());

    return res.status(200).json({
      success: true,
    });
  } catch {
    return res.status(200).json({
      success: true,
    });
  }
}