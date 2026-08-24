import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || process.env.FAUST_SECRET_KEY || '';
const JWT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const COOKIE_NAME = 'mf_jwt';

interface JwtPayload {
  userId: number;
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

export function signJwt(userId: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({ userId, iat: now, exp: now + JWT_TTL } satisfies JwtPayload),
  );
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(token: string): { userId: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

  const expected = crypto
    .createHmac('sha256', SECRET)
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
    return { userId: data.userId };
  } catch {
    return null;
  }
}

export function extractJwt(cookies: string): string | null {
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function jwtCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${JWT_TTL}${secure}`;
}

export function clearJwtCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
