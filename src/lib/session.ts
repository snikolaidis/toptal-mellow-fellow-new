import type { GetServerSidePropsContext } from 'next';
import type { IncomingMessage, ServerResponse } from 'http';
import { getIronSession, type SessionOptions, type IronSession } from 'iron-session';

export interface SessionData {
  userId: number;
  accessToken: string;
  accessTokenExpiration: number;
}

const sessionOptions: SessionOptions = {
  cookieName: 'mf_session',
  password: process.env.SESSION_SECRET || process.env.FAUST_SECRET_KEY || '',
  ttl: 86400,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
  },
};

export async function getSession(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions);
}

export async function getSessionFromContext(
  ctx: GetServerSidePropsContext,
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(ctx.req, ctx.res, sessionOptions);
}
