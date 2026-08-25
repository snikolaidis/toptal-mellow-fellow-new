import crypto from 'crypto';

function getSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.FAUST_SECRET_KEY;
  if (!s) {
    throw new Error(
      'FATAL: Neither SESSION_SECRET nor FAUST_SECRET_KEY is set. JWT signing requires a secret.',
    );
  }
  return s;
}

const ACCESS_TTL = 2 * 60; // 2 minutes (TESTING — revert to 15 * 60 after verification)
const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days
const ACCESS_COOKIE = 'mf_jwt';
const REFRESH_COOKIE = 'mf_refresh';

interface JwtPayload {
  userId: number;
  sid: string;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function signJwt(userId: number, sessionId: string = ''): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      userId,
      sid: sessionId,
      iat: now,
      exp: now + ACCESS_TTL,
    } satisfies JwtPayload),
  );
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(
  token: string,
): { userId: number; sessionId: string; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const data: JwtPayload = JSON.parse(base64urlDecode(payload).toString());
    const now = Math.floor(Date.now() / 1000);
    if (!data.userId || !data.exp || data.exp <= now) return null;
    return {
      userId: data.userId,
      sessionId: data.sid || '',
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

export function extractJwt(cookies: string): string | null {
  const match = cookies.match(new RegExp(`${ACCESS_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function jwtCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_TTL}${secure}`;
}

export function clearJwtCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function refreshCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${REFRESH_TTL}${secure}`;
}

export function clearRefreshCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${REFRESH_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function extractRefreshToken(cookies: string): string | null {
  const match = cookies.match(new RegExp(`${REFRESH_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
