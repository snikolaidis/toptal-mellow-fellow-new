import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { makeHttpRequest, getWordPressGraphQLUrl } from './http';
import { getSessionFromContext, type SessionData } from './session';
import { exchangeRefreshToken } from './faust-auth';

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

  return {
    accessToken: tokens.accessToken,
    userId,
    accessTokenExpiration: tokens.accessTokenExpiration || 0,
  };
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
