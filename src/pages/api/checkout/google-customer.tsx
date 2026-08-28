import type { NextApiRequest, NextApiResponse } from 'next';
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
    const session = await getSession(req, res);

    if (!session.userId) {
      return res.status(401).json({
        error: 'Google session not found',
      });
    }

    const wordpressUrl =
      process.env.NEXT_PUBLIC_WORDPRESS_URL;

    const googleSecret =
      process.env.MF_GOOGLE_AUTH_SECRET;

    if (!wordpressUrl) {
      return res.status(500).json({
        error: 'WordPress URL is not configured',
      });
    }

    if (!googleSecret) {
      return res.status(500).json({
        error: 'Google auth secret is not configured',
      });
    }

    const response = await fetch(
      `${wordpressUrl}/wp-json/mellow-fellow/v1/google-customer`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MF-Google-Secret': googleSecret,
        },
        body: JSON.stringify({
          userId: session.userId,
          billing: req.body?.billing || {},
          shipping: req.body?.shipping || {},
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        'Google customer update failed:',
        data
      );

      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error(
      'Google customer update error:',
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to update Google customer',
    });
  }
}