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
      return res.status(401).json({
        error: 'Not authenticated',
      });
    }

    const wordpressUrl =
      process.env.NEXT_PUBLIC_WORDPRESS_URL;

   const settingsSecret =
  process.env.FAUSTWP_SECRET_KEY ||
  process.env.MF_FAUST_SECRET ||
  process.env.FAUST_SECRET_KEY ||
  process.env.NEXT_PUBLIC_FAUSTWP_SECRET_KEY;

    if (!wordpressUrl) {
      return res.status(500).json({
        error: 'WordPress URL is not configured',
      });
    }

    if (!settingsSecret) {
      return res.status(500).json({
        error: 'Faust secret is not configured',
      });
    }

    const response = await fetch(
      `${wordpressUrl}/wp-json/mellow-fellow/v1/checkout-customer?user_id=${session.userId}`,
      {
        method: 'GET',
        headers: {
          'X-FaustWP-Secret': settingsSecret,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Checkout customer error:', error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load customer',
    });
  }
}