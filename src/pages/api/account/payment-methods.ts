/**
 * Payment Methods API
 *
 * GET: Returns saved cards for the authenticated user
 * DELETE: Removes a saved card (query param: paymentProfileId)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { makeHttpRequest, getWordPressGraphQLUrl } from '@/lib/http';
import { deletePaymentProfile } from '@/lib/authorize-net-cim';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const FAUST_SECRET = process.env.FAUST_SECRET_KEY || '';

async function getAuthenticatedUserId(req: NextApiRequest): Promise<number | null> {
  // Extract Faust.js refresh token from cookies to get auth token
  const cookies = req.headers.cookie || '';
  const host = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const rtPattern = new RegExp(`https?${host.replace(/\./g, '\\.')}-rt=([^;]+)`);
  const rtMatch = cookies.match(rtPattern);

  if (!rtMatch) return null;

  try {
    // Exchange refresh token for access token
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const reqHost = req.headers.host || 'localhost:3000';
    const tokenUrl = `${protocol}://${reqHost}/api/faust/auth/token`;
    const tokenRes = await fetch(tokenUrl, {
      headers: { Cookie: cookies },
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.accessToken;

    if (!accessToken) return null;

    // Get WordPress user ID
    const wpUrl = getWordPressGraphQLUrl();
    const viewerRes = await makeHttpRequest({
      url: wpUrl,
      body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
      authToken: accessToken,
    });

    return viewerRes.data?.data?.viewer?.databaseId || null;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    try {
      const wpRes = await fetch(`${WP_URL}/wp-json/mf/v1/payment-profiles/${userId}`, {
        headers: { Authorization: `Bearer ${FAUST_SECRET}` },
      });
      const data = await wpRes.json();

      return res.status(200).json({
        success: true,
        customerProfileId: data.customerProfileId || null,
        cards: data.paymentProfiles || [],
      });
    } catch {
      return res.status(200).json({ success: true, customerProfileId: null, cards: [] });
    }
  }

  if (req.method === 'DELETE') {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { paymentProfileId } = req.query;
    if (typeof paymentProfileId !== 'string') {
      return res.status(400).json({ success: false, message: 'paymentProfileId required' });
    }

    try {
      // Get customer profile ID from WordPress
      const wpRes = await fetch(`${WP_URL}/wp-json/mf/v1/payment-profiles/${userId}`, {
        headers: { Authorization: `Bearer ${FAUST_SECRET}` },
      });
      const data = await wpRes.json();
      const customerProfileId = data.customerProfileId;

      if (!customerProfileId) {
        return res.status(404).json({ success: false, message: 'No saved cards' });
      }

      // Delete from Authorize.net
      await deletePaymentProfile(customerProfileId, paymentProfileId);

      // Delete from WordPress
      await fetch(`${WP_URL}/wp-json/mf/v1/payment-profiles/${userId}/${paymentProfileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${FAUST_SECRET}` },
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Payment Methods] Delete failed:', err);
      return res.status(500).json({ success: false, message: 'Failed to delete card' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
