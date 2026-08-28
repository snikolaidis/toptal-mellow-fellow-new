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
      success: false,
      message: 'Method not allowed',
    });
  }

  try {
    const session = await getSession(
      req,
      res
    );

    console.log(
      'Logging out user:',
      session.userId
    );

    session.destroy();

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error(
      'Logout error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
}