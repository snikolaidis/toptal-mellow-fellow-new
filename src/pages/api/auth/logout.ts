import type { NextApiRequest, NextApiResponse } from 'next';
import { clearJwtCookieHeader } from '@/lib/jwt-auth';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  res.setHeader('Set-Cookie', [
    clearJwtCookieHeader(),
    `mf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  ]);

  return res.status(200).json({ success: true });
}
