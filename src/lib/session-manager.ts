import crypto from 'crypto';
import type { NextApiRequest } from 'next';
import { getStorage } from '@/lib/storage';
import type { AuthSession } from '@/lib/storage/types';
import {
  signJwt,
  jwtCookieHeader,
  refreshCookieHeader,
  clearJwtCookieHeader,
  clearRefreshCookieHeader,
} from './jwt-auth';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket?.remoteAddress || 'unknown';
}

interface RequestInfo {
  userAgent: string;
  ipAddress: string;
}

export async function createSession(
  userId: number,
  reqInfo: NextApiRequest | RequestInfo,
): Promise<{
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  setCookieHeaders: string[];
}> {
  const storage = await getStorage();
  const sessionId = crypto.randomUUID();
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  const info = 'headers' in reqInfo
    ? { userAgent: (reqInfo.headers['user-agent'] as string) || '', ipAddress: getClientIp(reqInfo as NextApiRequest) }
    : reqInfo;

  const session: AuthSession = {
    sessionId,
    userId,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: info.userAgent,
    ipAddress: info.ipAddress,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + REFRESH_TOKEN_TTL_MS,
    revoked: false,
  };

  await storage.createAuthSession(session);

  const accessToken = signJwt(userId, sessionId);

  return {
    accessToken,
    refreshToken,
    sessionId,
    setCookieHeaders: [
      jwtCookieHeader(accessToken),
      refreshCookieHeader(refreshToken),
    ],
  };
}

export async function refreshSession(
  rawRefreshToken: string,
  req: NextApiRequest,
): Promise<{
  accessToken: string;
  newRefreshToken: string;
  sessionId: string;
  userId: number;
  setCookieHeaders: string[];
} | null> {
  const storage = await getStorage();
  const hash = hashToken(rawRefreshToken);
  const session = await storage.getAuthSessionByRefreshTokenHash(hash);

  if (!session || session.revoked || session.expiresAt <= Date.now()) {
    return null;
  }

  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const newHash = hashToken(newRefreshToken);
  await storage.updateAuthSessionRefreshToken(session.sessionId, newHash);

  const accessToken = signJwt(session.userId, session.sessionId);

  return {
    accessToken,
    newRefreshToken,
    sessionId: session.sessionId,
    userId: session.userId,
    setCookieHeaders: [
      jwtCookieHeader(accessToken),
      refreshCookieHeader(newRefreshToken),
    ],
  };
}

export async function validateSession(sessionId: string): Promise<boolean> {
  if (!sessionId) return true; // Legacy JWTs without sid — honor during transition
  const storage = await getStorage();
  const session = await storage.getAuthSessionById(sessionId);
  console.log("Validating session:", sessionId, session);
  if (!session) return false;
  return !session.revoked && session.expiresAt > Date.now();
}

export async function revokeSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const storage = await getStorage();
  await storage.revokeAuthSession(sessionId);
}

export async function revokeAllSessions(userId: number): Promise<void> {
  const storage = await getStorage();
  await storage.revokeAllUserAuthSessions(userId);
}

export async function getActiveSessions(
  userId: number,
): Promise<AuthSession[]> {
  const storage = await getStorage();
  return storage.getAuthSessionsByUserId(userId);
}

export function clearAllAuthCookieHeaders(): string[] {
  const wpUrl = process.env.NEXT_PUBLIC_WORDPRESS_URL || "";
  const faustCookieName = `${wpUrl.replace(/[^!#$%&'*+\-.^_\`|~0-9A-Za-z]/g, "")}-rt`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  return [
    clearJwtCookieHeader(),
    clearRefreshCookieHeader(),
    `mf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `${faustCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`,
    `wc_cart_token=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`,
    `wc_session_token=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`,
    `wp_woocommerce_session=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`,
  ];
}

