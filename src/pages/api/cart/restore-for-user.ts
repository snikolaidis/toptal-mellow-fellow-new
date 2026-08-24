import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'https';
import http from 'http';
import { makeHttpRequest, getWordPressGraphQLUrl } from '@/lib/http';
import { withRateLimitOnly } from '@/lib/middleware';
import { exchangeRefreshToken } from '@/lib/faust-auth';

const keepAliveAgent = new https.Agent({ keepAlive: true });
const keepAliveAgentHttp = new http.Agent({ keepAlive: true });

function authenticatedGet(url: string, faustSecret: string): Promise<{ data: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${faustSecret}`,
      },
      agent: isHttps ? keepAliveAgent : keepAliveAgentHttp,
    };

    const req = lib.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ data: JSON.parse(body) }); }
        catch { resolve({ data: body }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getAuthTokenFromRequest(req: NextApiRequest): Promise<string | undefined> {
  const cookies = req.headers.cookie || '';
  try {
    const tokens = await exchangeRefreshToken(cookies);
    return tokens?.accessToken || undefined;
  } catch {
    return undefined;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authToken = await getAuthTokenFromRequest(req);
    if (!authToken) {
      return res.status(200).json({ success: true, restored: false });
    }

    const graphqlUrl = getWordPressGraphQLUrl();
    const viewerRes = await makeHttpRequest({
      url: graphqlUrl,
      body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
      authToken,
    });
    const userId = viewerRes.data?.data?.viewer?.databaseId;
    if (!userId) {
      return res.status(200).json({ success: true, restored: false });
    }

    const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const faustSecret = process.env.FAUST_SECRET_KEY || '';

    const tokenRes = await authenticatedGet(
      `${wordpressUrl}/wp-json/mf/v1/cart-token/${userId}`,
      faustSecret,
    );

    const savedToken = tokenRes.data?.cartToken;
    if (!savedToken) {
      return res.status(200).json({ success: true, restored: false });
    }

    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `wc_cart_token=${encodeURIComponent(savedToken)}; Path=/; HttpOnly; Expires=${expiry}; SameSite=Lax${secure}`,
    ]);

    return res.status(200).json({ success: true, restored: true });
  } catch (err) {
    console.error('[restore-for-user] Error:', err);
    return res.status(200).json({ success: true, restored: false });
  }
}

export default withRateLimitOnly(10, 60000)(handler);
