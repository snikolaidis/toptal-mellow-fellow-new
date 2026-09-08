import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import {
  makeHttpRequest,
  makeHttpGetRequest,
  getWordPressGraphQLUrl,
} from '@/lib/http';

async function getFaustCustomerId(
  req: NextApiRequest
): Promise<number | null> {
  try {
    const cookies = req.headers.cookie || '';

    const wordpressUrl = (
      process.env.NEXT_PUBLIC_WORDPRESS_URL || ''
    ).replace(/\/$/, '');

    if (!wordpressUrl) {
      return null;
    }

    const wpHost = new URL(wordpressUrl).host
      .replace(/[^a-zA-Z0-9.-]/g, '');

    const rtCookiePattern = new RegExp(
      `https?${wpHost}-rt=([^;]+)`
    );

    /*
     * No Faust login cookie = not a Mellow Fellow login.
     */
    if (!cookies.match(rtCookiePattern)) {
      return null;
    }

    const protocol =
      req.headers['x-forwarded-proto'] ||
      (process.env.NODE_ENV === 'development'
        ? 'http'
        : 'https');

    const host =
      req.headers.host ||
      'localhost:3000';

    /*
     * Get Faust access token.
     */
    const tokenUrl =
      `${protocol}://${host}/api/faust/auth/token`;

    const tokenResponse =
      await makeHttpGetRequest(
        tokenUrl,
        cookies
      );

    const accessToken =
      tokenResponse.data?.accessToken;

    if (!accessToken) {
      return null;
    }

    /*
     * Get the currently logged-in
     * Mellow Fellow WordPress user.
     */
    const graphqlUrl =
      getWordPressGraphQLUrl();

    const viewerResponse =
      await makeHttpRequest({
        url: graphqlUrl,
        body: JSON.stringify({
          query: `
            query {
              viewer {
                databaseId
              }
            }
          `,
        }),
        authToken: accessToken,
      });

    const userId =
      viewerResponse.data?.data?.viewer?.databaseId;

    if (!userId) {
      return null;
    }

    return Number(userId);

  } catch (error) {
    console.error(
      'Failed to resolve Faust customer:',
      error
    );

    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // if (req.method !== 'GET') {
  //   return res.status(405).json({
  //     error: 'Method not allowed',
  //   });
  // }

  const allowedMethods = ['GET', 'POST'];

if (!allowedMethods.includes(req.method || '')) {
  return res.status(405).json({
    error: 'Method not allowed',
  });
}

  try {

    /*
     * =====================================================
     * 1. FIRST PRIORITY = MELLOW FELLOW / FAUST
     * =====================================================
     *
     * If Faust login exists, ALWAYS use that customer.
     */
    const faustUserId =
      await getFaustCustomerId(req);

    let userId: number | null =
      faustUserId;

    /*
     * =====================================================
     * 2. SECOND PRIORITY = GOOGLE
     * =====================================================
     *
     * Only use the custom Google session when
     * there is no Mellow Fellow login.
     */
    if (!userId) {

      const session =
        await getSession(req, res);

      if (session.userId) {
        userId =
          Number(session.userId);
      }
    }

    /*
     * =====================================================
     * 3. GUEST
     * =====================================================
     */
    if (!userId) {
      return res.status(401).json({
        error: 'Not authenticated',
      });
    }

    if (req.method === 'POST') {
  const body = req.body;

  if (!body || !body.billing) {
    return res.status(400).json({
      error: 'Billing address is required.',
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
    `${wordpressUrl}/wp-json/mellow-fellow/v1/checkout-customer`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FaustWP-Secret': settingsSecret,
      },
      body: JSON.stringify({
        user_id: userId,
        billing: body.billing,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return res.status(response.status).json(data);
  }

  return res.status(200).json(data);
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

    /*
     * Load customer from WordPress.
     */
    const response = await fetch(
      `${wordpressUrl}/wp-json/mellow-fellow/v1/checkout-customer?user_id=${userId}`,
      {
        method: 'GET',
        headers: {
          'X-FaustWP-Secret':
            settingsSecret,
        },
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      return res.status(
        response.status
      ).json(data);
    }

    return res.status(200).json(data);

  } catch (error) {

    console.error(
      'Checkout customer error:',
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load customer',
    });
  }
}