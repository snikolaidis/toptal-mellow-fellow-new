import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { makeHttpRequest, makeHttpGetRequest, getWordPressGraphQLUrl } from './http';
import { getSessionFromContext, type SessionData } from './session';

interface AuthResult {
  accessToken: string;
  userId: number;
}

export async function getServerSideAuth(
  ctx: GetServerSidePropsContext,
): Promise<AuthResult | null> {
  const session = await getSessionFromContext(ctx);

  if (session.userId && session.accessToken && session.accessTokenExpiration) {
    const now = Math.floor(Date.now() / 1000);
    if (session.accessTokenExpiration > now + 30) {
      return { accessToken: session.accessToken, userId: session.userId };
    }
  }

  const result = await exchangeFaustToken(ctx);
  if (!result) return null;

  session.userId = result.userId;
  session.accessToken = result.accessToken;
  session.accessTokenExpiration = result.accessTokenExpiration;
  await session.save();

  return { accessToken: result.accessToken, userId: result.userId };
}

async function exchangeFaustToken(
  ctx: GetServerSidePropsContext,
): Promise<(AuthResult & { accessTokenExpiration: number }) | null> {
  const cookies = ctx.req.headers.cookie || '';
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const wpHost = new URL(wordpressUrl).host.replace(/[^a-zA-Z0-9.-]/g, '');
  const rtCookiePattern = new RegExp(`https?${wpHost}-rt=([^;]+)`);

  if (!cookies.match(rtCookiePattern)) return null;

  try {
    const protocol = ctx.req.headers['x-forwarded-proto'] || 'https';
    const host = ctx.req.headers.host || 'localhost:3001';
    const tokenUrl = `${protocol}://${host}/api/faust/auth/token`;
    const tokenRes = await makeHttpGetRequest(tokenUrl, cookies);

    const accessToken = tokenRes.data?.accessToken;
    const accessTokenExpiration = tokenRes.data?.accessTokenExpiration;
    if (!accessToken) return null;

    const graphqlUrl = getWordPressGraphQLUrl();
    const viewerRes = await makeHttpRequest({
      url: graphqlUrl,
      body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
      authToken: accessToken,
    });
    const userId = viewerRes.data?.data?.viewer?.databaseId;
    if (!userId) return null;

    return { accessToken, userId, accessTokenExpiration: accessTokenExpiration || 0 };
  } catch {
    return null;
  }
}

export function redirectToLogin(
  ctx: GetServerSidePropsContext,
): GetServerSidePropsResult<any> {
  const path = ctx.resolvedUrl || '/account';
  return {
    redirect: {
      destination: `/login?redirect=${encodeURIComponent(path)}`,
      permanent: false,
    },
  };
}

export async function serverSideGraphQL(
  query: string,
  accessToken: string,
  variables?: Record<string, unknown>,
): Promise<any> {
  const graphqlUrl = getWordPressGraphQLUrl();
  const body: Record<string, unknown> = { query };
  if (variables) body.variables = variables;

  const res = await makeHttpRequest({
    url: graphqlUrl,
    body: JSON.stringify(body),
    authToken: accessToken,
  });
  return res.data?.data || null;
}
