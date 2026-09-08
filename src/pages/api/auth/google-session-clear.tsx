import type {
  NextApiRequest,
  NextApiResponse,
} from 'next';

import { getSession } from '@/lib/session';
import { clearAllAuthCookieHeaders } from '@/lib/session-manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    const session =
      await getSession(req, res);

    /*
     * Clear ONLY our application session.
     *
     * This does NOT logout the user's
     * actual Google account.
     */
    (session as any).userId = undefined;
    (session as any).accessToken = undefined;
    (session as any).accessTokenExpiration = undefined;

    await session.save();

    res.setHeader('Set-Cookie', clearAllAuthCookieHeaders());

    return res.status(200).json({
      success: true,
    });

  } catch (error) {
    console.error(
      'Google session clear error:',
      error
    );

    return res.status(500).json({
      success: false,
    });
  }
}