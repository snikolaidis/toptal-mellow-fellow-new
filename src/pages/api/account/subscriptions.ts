import type { NextApiRequest, NextApiResponse } from 'next';
import { makeHttpRequest, getWordPressGraphQLUrl } from '@/lib/http';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const FAUST_SECRET = process.env.FAUST_SECRET_KEY || '';

async function getAuthenticatedUserId(req: NextApiRequest): Promise<number | null> {
  const cookies = req.headers.cookie || '';
  const host = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const rtPattern = new RegExp(`https?${host.replace(/\./g, '\\.')}-rt=([^;]+)`);
  const rtMatch = cookies.match(rtPattern);
  if (!rtMatch) return null;

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const reqHost = req.headers.host || 'localhost:3000';
    const tokenUrl = `${protocol}://${reqHost}/api/faust/auth/token`;
    const tokenRes = await fetch(tokenUrl, { headers: { Cookie: cookies } });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.accessToken;
    if (!accessToken) return null;

    const viewerRes = await makeHttpRequest({
      url: getWordPressGraphQLUrl(),
      body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
      authToken: accessToken,
    });
    return viewerRes.data?.data?.viewer?.databaseId || null;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    try {
      const wpRes = await fetch(`${WP_URL}/wp-json/mf/v1/subscriptions/${userId}`, {
        headers: { Authorization: `Bearer ${FAUST_SECRET}` },
      });
      const data = await wpRes.json();
      return res.status(200).json({ success: true, subscriptions: data.subscriptions || [] });
    } catch {
      return res.status(200).json({ success: true, subscriptions: [] });
    }
  }

  if (req.method === 'POST') {
    const subscriptionId = Number(req.body?.subscriptionId);
    if (!subscriptionId) {
      return res.status(400).json({ success: false, message: 'subscriptionId required' });
    }
    try {
      const wpRes = await fetch(`${WP_URL}/wp-json/mf/v1/subscriptions/${userId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FAUST_SECRET}` },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = await wpRes.json();
      if (!wpRes.ok || !data.success) {
        return res.status(wpRes.status || 400).json({ success: false, message: data.error || 'Could not cancel' });
      }
      return res.status(200).json({ success: true, status: data.status });
    } catch {
      return res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
