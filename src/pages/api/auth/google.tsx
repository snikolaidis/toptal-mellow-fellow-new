import type { NextApiRequest, NextApiResponse } from 'next';
import { OAuth2Client } from 'google-auth-library';
import { getSession } from '@/lib/session';

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId) {
  console.warn(
    'NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured'
  );
}

if (!clientSecret) {
  console.warn(
    'GOOGLE_CLIENT_SECRET is not configured'
  );
}

const googleClient = new OAuth2Client(
  clientId,
  clientSecret
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  /*
   * Only GET is required for this OAuth flow.
   */
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    /*
     * Google sends the user back to this URL with:
     *
     * ?code=XXXXXXXX
     *
     * If there is no code, start the OAuth flow.
     */

    const code =
      typeof req.query.code === 'string'
        ? req.query.code
        : null;

    /*
     * STEP 1
     *
     * Start Google OAuth.
     */
    if (!code) {
      if (!clientId) {
        return res.status(500).json({
          error:
            'NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing',
        });
      }

      const redirectUri =
        `${getBaseUrl(req)}/api/auth/google`;

      const authorizationUrl =
        googleClient.generateAuthUrl({
          access_type: 'offline',
          scope: [
            'openid',
            'email',
            'profile',
          ],
          prompt: 'select_account',
          redirect_uri: redirectUri,
        });

      return res.redirect(authorizationUrl);
    }

    /*
     * STEP 2
     *
     * Exchange Google's authorization code
     * for tokens.
     */
    if (!clientSecret) {
      return res.status(500).json({
        error:
          'GOOGLE_CLIENT_SECRET is missing',
      });
    }

    const redirectUri =
      `${getBaseUrl(req)}/api/auth/google`;

    const { tokens } =
      await googleClient.getToken({
        code,
        redirect_uri: redirectUri,
      });

    /*
     * STEP 3
     *
     * Make sure Google returned an ID token.
     */
    if (!tokens.id_token) {
      return res.status(401).json({
        error:
          'Google did not return an ID token',
      });
    }

    /*
     * STEP 4
     *
     * Verify the Google ID token.
     */
    const ticket =
      await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        error:
          'Unable to read Google account',
      });
    }

    /*
     * STEP 5
     *
     * Extract Google user information.
     */
    const googleUser = {
      googleId: payload.sub,
      email: payload.email || '',
      name: payload.name || '',
      firstName: payload.given_name || '',
      lastName: payload.family_name || '',
      picture: payload.picture || '',
    };

    if (!googleUser.email) {
      return res.status(400).json({
        error:
          'Google account does not have an email address',
      });
    }

    /*
     * TEMPORARY
     *
     * Google authentication is working at this point.
     *
     * The next step will connect this Google user
     * to your WordPress/WooCommerce + Faust login.
     */
   const wordpressUrl =
  process.env.NEXT_PUBLIC_WORDPRESS_URL;

const googleAuthSecret =
  process.env.MF_GOOGLE_AUTH_SECRET;

if (!wordpressUrl) {
  return res.status(500).json({
    error: 'WordPress URL is not configured',
  });
}

if (!googleAuthSecret) {
  return res.status(500).json({
    error: 'Google auth secret is not configured',
  });
}

const wordpressResponse = await fetch(
  `${wordpressUrl}/wp-json/mellow-fellow/v1/google-auth`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MF-Google-Secret': googleAuthSecret,
    },
    body: JSON.stringify({
      email: googleUser.email,
      firstName: googleUser.firstName,
      lastName: googleUser.lastName,
      googleId: googleUser.googleId,
    }),
  }
);

const wordpressResult =
  await wordpressResponse.json();

if (!wordpressResponse.ok) {
  console.error(
    'WordPress Google authentication failed:',
    wordpressResult
  );

  return res.status(
    wordpressResponse.status
  ).json({
    error:
      wordpressResult?.message ||
      wordpressResult?.code ||
      'WordPress authentication failed',
  });
}

console.log(
  'WordPress Google user:',
  wordpressResult
);

const session = await getSession(req, res);

session.userId = Number(wordpressResult.user.id);
session.accessToken = '';
session.accessTokenExpiration =
  Math.floor(Date.now() / 1000) + 86400;

await session.save();

console.log('Google session saved:', {
  userId: session.userId,
});

return res.redirect('/checkout');
  } catch (error) {
    console.error(
      'Google OAuth error:',
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Google authentication failed',
    });
  }
}

/**
 * Get the current site's base URL.
 */
function getBaseUrl(
  req: NextApiRequest
): string {
  const protocol =
    process.env.NODE_ENV === 'development'
      ? 'http'
      : 'https';

  const host =
    req.headers.host || 'localhost:3000';

  return `${protocol}://${host}`;
}