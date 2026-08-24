import type { NextApiRequest, NextApiResponse } from 'next';
import { makeHttpRequest } from '@/lib/http';
import { withRateLimitOnly } from '@/lib/middleware';
import { verifyJwt, extractJwt } from '@/lib/jwt-auth';

function extractCartToken(cookies: string): string | null {
  const match = cookies.match(/wc_cart_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const cookies = req.headers.cookie || '';
    const cartToken = extractCartToken(cookies);

    if (!cartToken) {
      return res.status(200).json({ success: true, saved: false });
    }

    const jwt = extractJwt(cookies);
    const auth = jwt ? verifyJwt(jwt) : null;
    if (!auth) {
      return res.status(200).json({ success: true, saved: false });
    }

    const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const faustSecret = process.env.FAUST_SECRET_KEY || '';

    await makeHttpRequest({
      url: `${wordpressUrl}/wp-json/mf/v1/cart-token`,
      body: JSON.stringify({ userId: auth.userId, cartToken }),
      faustSecretKey: faustSecret,
    });

    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `wc_cart_token=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`,
    ]);

    return res.status(200).json({ success: true, saved: true });
  } catch (err) {
    console.error('[save-for-user] Error:', err);
    return res.status(200).json({ success: true, saved: false });
  }
}

export default withRateLimitOnly(10, 60000)(handler);
