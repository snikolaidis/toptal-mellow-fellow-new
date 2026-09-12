import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Guest-safe order line items lookup, proxied server-side so the
 * WordPress REST URL never has to be called directly from the
 * browser. Authorization is the order's own key (see
 * mellow-fellow-order-items.php) - not any session/login state -
 * since this has to work for order-confirmation after a guest
 * checkout, a page reload, or a shared/emailed link, none of which
 * carry an authenticated session.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, key } = req.query;

  if (
    typeof orderId !== 'string' ||
    typeof key !== 'string' ||
    !orderId ||
    !key
  ) {
    return res.status(400).json({ error: 'orderId and key are required' });
  }

  const wordpressUrl = (
    process.env.NEXT_PUBLIC_WORDPRESS_URL || ''
  ).replace(/\/$/, '');

  if (!wordpressUrl) {
    return res.status(500).json({ error: 'WordPress URL is not configured' });
  }

  try {
    const response = await fetch(
      `${wordpressUrl}/wp-json/mellow-fellow/v1/order-items?order_id=${encodeURIComponent(orderId)}&key=${encodeURIComponent(key)}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Failed to load order items:', error);
    return res.status(500).json({ error: 'Failed to load order items' });
  }
}
