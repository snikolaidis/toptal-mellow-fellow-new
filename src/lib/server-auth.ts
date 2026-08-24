import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { makeHttpRequest, getWordPressGraphQLUrl } from './http';
import { verifyJwt, extractJwt, signJwt, jwtCookieHeader } from './jwt-auth';
import { exchangeRefreshToken, getAuthenticatedUserId } from './faust-auth';

interface AuthResult {
  accessToken?: string;
  userId: number;
}

export async function getServerSideAuth(
  ctx: GetServerSidePropsContext,
): Promise<AuthResult | null> {
  const cookies = ctx.req.headers.cookie || '';

  // Fast path: verify JWT locally (no network call)
  const token = extractJwt(cookies);
  if (token) {
    const result = verifyJwt(token);
    if (result) {
      return { userId: result.userId };
    }
  }

  // Fallback: exchange Faust refresh token (transition period)
  const auth = await getAuthenticatedUserId(cookies);
  if (!auth) return null;

  // Issue JWT retroactively so subsequent requests use the fast path
  const jwt = signJwt(auth.userId);
  ctx.res.setHeader('Set-Cookie', jwtCookieHeader(jwt));

  return { accessToken: auth.accessToken, userId: auth.userId };
}

export async function getServerSideAuthWithToken(
  ctx: GetServerSidePropsContext,
): Promise<{ accessToken: string; userId: number } | null> {
  const cookies = ctx.req.headers.cookie || '';

  // Even with JWT, we need a WPGraphQL access token for authenticated queries.
  // Try JWT first for userId, then get token only if needed.
  const token = extractJwt(cookies);
  if (token) {
    const jwtResult = verifyJwt(token);
    if (jwtResult) {
      // We know the user is authenticated — now get a WPGraphQL token
      const tokens = await exchangeRefreshToken(cookies);
      if (tokens?.accessToken) {
        return { accessToken: tokens.accessToken, userId: jwtResult.userId };
      }
    }
  }

  // Full fallback
  const auth = await getAuthenticatedUserId(cookies);
  if (!auth) return null;

  const jwt = signJwt(auth.userId);
  ctx.res.setHeader('Set-Cookie', jwtCookieHeader(jwt));

  return { accessToken: auth.accessToken, userId: auth.userId };
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
