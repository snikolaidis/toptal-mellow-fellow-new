import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getSession(req, res);
  session.destroy();

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  /*
   * session.destroy() already queued a Set-Cookie header to clear
   * mf_session. Append to it instead of overwriting, or that cookie
   * clear gets silently discarded.
   */
  const existingSetCookie = res.getHeader('Set-Cookie');
  const existingCookies = Array.isArray(existingSetCookie)
    ? existingSetCookie.map(String)
    : existingSetCookie
    ? [String(existingSetCookie)]
    : [];

  res.setHeader('Set-Cookie', [
    ...existingCookies,
    `wc_session_token=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`,
    `wp_woocommerce_session=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`,
  ]);

  return res.status(200).json({ success: true, message: 'Session cleared' });
}
