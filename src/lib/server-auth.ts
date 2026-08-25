import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { makeHttpRequest, getWordPressGraphQLUrl } from './http';
import { verifyJwt, extractJwt, signJwt, jwtCookieHeader, refreshCookieHeader } from './jwt-auth';
import { exchangeRefreshToken, getAuthenticatedUserId } from './faust-auth';
import { validateSession, createSession } from './session-manager';
import { getStorage } from '@/lib/storage';
import crypto from 'crypto';

interface AuthResult {
  accessToken?: string;
  userId: number;
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

  const sessionResult = await createServerSession(auth.userId, ctx);
  ctx.res.setHeader('Set-Cookie', sessionResult.setCookieHeaders);

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
        const sessionResult = await createServerSession(userId, ctx);
        ctx.res.setHeader('Set-Cookie', sessionResult.setCookieHeaders);
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

async function createServerSession(
  userId: number,
  ctx: GetServerSidePropsContext,
): Promise<{ setCookieHeaders: string[] }> {
  const storage = await getStorage();
  const sessionId = crypto.randomUUID();
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  await storage.createAuthSession({
    sessionId,
    userId,
    refreshTokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
    userAgent: (ctx.req.headers['user-agent'] as string) || '',
    ipAddress: getClientIp(ctx),
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    revoked: false,
  });

  const accessToken = signJwt(userId, sessionId);

  return {
    setCookieHeaders: [
      jwtCookieHeader(accessToken),
      refreshCookieHeader(refreshToken),
    ],
  };
}

function getClientIp(ctx: GetServerSidePropsContext): string {
  const forwarded = ctx.req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return ctx.req.socket?.remoteAddress || 'unknown';
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
