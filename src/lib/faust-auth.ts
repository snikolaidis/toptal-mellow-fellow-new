import { makeHttpRequest, getWordPressGraphQLUrl } from './http';
import { createCircuitBreaker } from './circuit-breaker';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const FAUST_SECRET = process.env.FAUST_SECRET_KEY || '';

const wpCircuit = createCircuitBreaker('wordpress-auth');

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

  return wpCircuit.execute(async () => {
    const res = await fetch(`${WP_URL}/?rest_route=/faustwp/v1/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-faustwp-secret': FAUST_SECRET,
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) throw new Error(`WP returned ${res.status}`);

    const data = await res.json();
    if (!data.accessToken) throw new Error('No access token in response');

    return data as FaustTokens;
  });
}

export async function exchangeAuthCode(
  code: string,
): Promise<{ userId: number; accessToken: string } | null> {
  if (!code || !FAUST_SECRET) return null;

  const result = await wpCircuit.execute(async () => {
    const res = await fetch(`${WP_URL}/?rest_route=/faustwp/v1/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-faustwp-secret': FAUST_SECRET,
      },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) throw new Error(`WP returned ${res.status}`);

    const data = await res.json();
    if (!data.accessToken) throw new Error('No access token in response');
    return data as FaustTokens;
  });

  if (!result) return null;

  const graphqlUrl = getWordPressGraphQLUrl();
  const viewerRes = await makeHttpRequest({
    url: graphqlUrl,
    body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
    authToken: result.accessToken,
  });

  const userId = viewerRes.data?.data?.viewer?.databaseId;
  if (!userId) return null;

  return { userId, accessToken: result.accessToken };
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
