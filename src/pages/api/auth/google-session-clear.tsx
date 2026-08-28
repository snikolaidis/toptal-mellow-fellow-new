import type {
  NextApiRequest,
  NextApiResponse,
} from 'next';

import { getSession } from '@/lib/session';

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
    session.userId = undefined;
    session.accessToken = undefined;
    session.accessTokenExpiration =
      undefined;

    await session.save();

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