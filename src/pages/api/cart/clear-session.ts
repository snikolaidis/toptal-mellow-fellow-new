import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Clear WooCommerce Session API
 *
 * Clears the WooCommerce session cookie to ensure cart doesn't bleed
 * between different user sessions. Called during logout.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Clear the WooCommerce session cookie by setting it to empty with immediate expiry
  res.setHeader('Set-Cookie', [
    'wc_session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax',
    'wp_woocommerce_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax',
  ]);

  return res.status(200).json({ success: true, message: 'Session cleared' });
}
