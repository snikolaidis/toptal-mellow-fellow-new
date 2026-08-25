import type { NextApiRequest, NextApiResponse } from 'next';
import { clearJwtCookieHeader } from '@/lib/jwt-auth';

const WP_URL = process.env.NEXT_PUBLIC_WORDPRESS_URL || '';

function faustRefreshTokenCookieName(): string {
  return `${WP_URL.replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, '')}-rt`;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const faustCookieName = faustRefreshTokenCookieName();

  res.setHeader('Set-Cookie', [
    clearJwtCookieHeader(),
    `mf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `${faustCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`,
  ]);

  return res.status(200).json({ success: true });
}
