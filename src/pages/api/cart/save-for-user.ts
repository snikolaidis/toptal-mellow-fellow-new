import type { NextApiRequest, NextApiResponse } from 'next';
import { makeHttpRequest, makeHttpGetRequest, getWordPressGraphQLUrl } from '@/lib/http';
import { withRateLimitOnly } from '@/lib/middleware';

function extractCartToken(cookies: string): string | null {
  const match = cookies.match(/wc_cart_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function getAuthTokenFromRequest(req: NextApiRequest): Promise<string | undefined> {
  const cookies = req.headers.cookie || '';
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

  const wpHost = new URL(wordpressUrl).host.replace(/[^a-zA-Z0-9.-]/g, '');
  const rtCookiePattern = new RegExp(`https?${wpHost}-rt=([^;]+)`);
  const rtMatch = cookies.match(rtCookiePattern);

  if (!rtMatch) return undefined;

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost:3001';
    const tokenUrl = `${protocol}://${host}/api/faust/auth/token`;
    const tokenResponse = await makeHttpGetRequest(tokenUrl, cookies);
    return tokenResponse.data?.accessToken || undefined;
  } catch {
    return undefined;
  }
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

    const authToken = await getAuthTokenFromRequest(req);
    if (!authToken) {
      return res.status(200).json({ success: true, saved: false });
    }

    const graphqlUrl = getWordPressGraphQLUrl();
    const viewerRes = await makeHttpRequest({
      url: graphqlUrl,
      body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
      authToken,
    });
    const userId = viewerRes.data?.data?.viewer?.databaseId;
    if (!userId) {
      return res.status(200).json({ success: true, saved: false });
    }

    const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const faustSecret = process.env.FAUST_SECRET_KEY || '';

    await makeHttpRequest({
      url: `${wordpressUrl}/wp-json/mf/v1/cart-token`,
      body: JSON.stringify({ userId, cartToken }),
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
