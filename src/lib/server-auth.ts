import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { makeHttpRequest, getWordPressGraphQLUrl } from './http';
import { verifyJwt, extractJwt } from './jwt-auth';
import { exchangeRefreshToken, getAuthenticatedUserId } from './faust-auth';
import { validateSession, createSession } from './session-manager';

interface AuthResult {
  accessToken?: string;
  userId: number;
}

function extractRequestInfo(ctx: GetServerSidePropsContext) {
  const forwarded = ctx.req.headers['x-forwarded-for'];
  let ipAddress = 'unknown';
  if (typeof forwarded === 'string') ipAddress = forwarded.split(',')[0].trim();
  else if (Array.isArray(forwarded)) ipAddress = forwarded[0];
  else if (ctx.req.socket?.remoteAddress) ipAddress = ctx.req.socket.remoteAddress;

  return {
    userAgent: (ctx.req.headers['user-agent'] as string) || '',
    ipAddress,
  };
}

export async function getServerSideAuth(
  ctx: GetServerSidePropsContext,
): Promise<AuthResult | null> {
  const cookies = ctx.req.headers.cookie || '';

  const token = extractJwt(cookies);
  if (token) {
    const result = verifyJwt(token);
    if (result) {
      const sessionValid = await validateSession(result.sessionId);
      if (sessionValid) {
        return { userId: result.userId };
      }
    }
  }

  const auth = await getAuthenticatedUserId(cookies);
  if (!auth) return null;

  const session = await createSession(auth.userId, extractRequestInfo(ctx));
  ctx.res.setHeader('Set-Cookie', session.setCookieHeaders);

  return { accessToken: auth.accessToken, userId: auth.userId };
}

export async function getServerSideAuthWithToken(
  ctx: GetServerSidePropsContext,
): Promise<AuthResult | null> {
  const cookies = ctx.req.headers.cookie || '';

  const token = extractJwt(cookies);
  const jwtResult = token ? verifyJwt(token) : null;
  let jwtUserId: number | null = null;

  if (jwtResult) {
    const sessionValid = await validateSession(jwtResult.sessionId);
    if (sessionValid) {
      jwtUserId = jwtResult.userId;
    }
  }

  try {
    const tokens = await exchangeRefreshToken(cookies);
    if (tokens?.accessToken) {
      if (jwtUserId) {
        return { accessToken: tokens.accessToken, userId: jwtUserId };
      }
      const graphqlUrl = getWordPressGraphQLUrl();
      const viewerRes = await makeHttpRequest({
        url: graphqlUrl,
        body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
        authToken: tokens.accessToken,
      });
      const userId = viewerRes.data?.data?.viewer?.databaseId;
      if (userId) {
        const session = await createSession(userId, extractRequestInfo(ctx));
        ctx.res.setHeader('Set-Cookie', session.setCookieHeaders);
        return { accessToken: tokens.accessToken, userId };
      }
    }
  } catch {
    // WordPress unavailable
  }

  if (jwtUserId) {
    return { userId: jwtUserId };
  }

  return null;
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
  accessToken: string | undefined,
  variables?: Record<string, unknown>,
): Promise<any> {
  if (!accessToken) return null;
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
