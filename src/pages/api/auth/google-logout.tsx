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

    session.destroy();

    return res.status(200).json({
      success: true,
    });

  } catch (error) {
    console.error(
      'Google logout error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: 'Unable to logout',
    });
  }
}