import { makeHttpRequest, getWordPressGraphQLUrl } from './http';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const FAUST_SECRET = process.env.FAUST_SECRET_KEY || '';

interface FaustTokens {
  accessToken: string;
  accessTokenExpiration: number;
  refreshToken: string;
  refreshTokenExpiration: number;
}

function extractRefreshToken(cookies: string): string | null {
  const host = new URL(WP_URL).host.replace(/[^a-zA-Z0-9.-]/g, '');
  const pattern = new RegExp(`https?${host}-rt=([^;]+)`);
  const match = cookies.match(pattern);
  if (!match) return null;
  // Faust stores the refresh token as base64(token), then cookie.serialize
  // URI-encodes it. We need to reverse both layers.
  const uriDecoded = decodeURIComponent(match[1]);
  try {
    return Buffer.from(uriDecoded, 'base64').toString('utf8');
  } catch {
    return uriDecoded;
  }
}

export async function exchangeRefreshToken(
  cookies: string,
): Promise<FaustTokens | null> {
  const refreshToken = extractRefreshToken(cookies);
  if (!refreshToken || !FAUST_SECRET) return null;

  try {
    const res = await fetch(`${WP_URL}/?rest_route=/faustwp/v1/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-faustwp-secret': FAUST_SECRET,
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.accessToken) return null;

    return data as FaustTokens;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserId(
  cookies: string,
): Promise<{ userId: number; accessToken: string } | null> {
  const tokens = await exchangeRefreshToken(cookies);
  if (!tokens) return null;

  const graphqlUrl = getWordPressGraphQLUrl();
  const viewerRes = await makeHttpRequest({
    url: graphqlUrl,
    body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
    authToken: tokens.accessToken,
  });

  const userId = viewerRes.data?.data?.viewer?.databaseId;
  if (!userId) return null;

  return { userId, accessToken: tokens.accessToken };
}
