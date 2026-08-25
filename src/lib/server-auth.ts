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
): Promise<AuthResult | null> {
  const cookies = ctx.req.headers.cookie || '';

  // Step 1: Check JWT for identity (instant, no network)
  const token = extractJwt(cookies);
  const jwtUserId = token ? verifyJwt(token)?.userId ?? null : null;

  // Step 2: Get WPGraphQL access token (needs WordPress)
  try {
    const tokens = await exchangeRefreshToken(cookies);
    if (tokens?.accessToken) {
      if (jwtUserId) {
        return { accessToken: tokens.accessToken, userId: jwtUserId };
      }
      // No JWT but Faust works — get userId from viewer query and issue JWT
      const graphqlUrl = getWordPressGraphQLUrl();
      const viewerRes = await makeHttpRequest({
        url: graphqlUrl,
        body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
        authToken: tokens.accessToken,
      });
      const userId = viewerRes.data?.data?.viewer?.databaseId;
      if (userId) {
        const jwt = signJwt(userId);
        ctx.res.setHeader('Set-Cookie', jwtCookieHeader(jwt));
        return { accessToken: tokens.accessToken, userId };
      }
    }
  } catch {
    // WordPress unavailable — fall through
  }

  // JWT proves identity but WordPress can't provide a data token.
  // Return userId without accessToken so the page can show an error
  // instead of redirecting to login (the user IS authenticated).
  if (jwtUserId) {
    return { userId: jwtUserId };
  }

  // No JWT, no Faust — genuinely not authenticated
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
