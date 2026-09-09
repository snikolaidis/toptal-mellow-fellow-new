/**
 * Payment Methods API
 *
 * GET: Returns the payment methods checkout should offer. The Authorize.net
 * card flow is always available (it's built into this app, not a WooCommerce
 * gateway), plus whatever else is currently enabled in WooCommerce > Settings
 * > Payments (e.g. Cash on Delivery, Sezzle) — so turning a gateway on/off in
 * wp-admin is enough to change what shows up here, no deploy required.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { CheckoutPaymentMethod } from '@/types/checkout';

interface WcPaymentGateway {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}

const CARD_METHOD_ID = 'authorize_net';
const DEFAULT_CARD_METHOD: CheckoutPaymentMethod = {
  id: CARD_METHOD_ID,
  title: 'Credit Card',
  description: 'Pay securely with your credit or debit card.',
};

// Gateways that exist in WooCommerce but aren't wired to this headless
// checkout, so they must never surface here even while "enabled" in wp-admin.
// 'authnet' is a generic off-the-shelf Authorize.net plugin left over from
// before the custom 'authorize_net' headless gateway replaced it — WooCommerce
// still reports it enabled, but this storefront never talks to it.
const IGNORED_GATEWAY_IDS = new Set(['authnet']);

function getWcApiUrl(): string {
  if (process.env.WC_API_URL) return process.env.WC_API_URL.replace(/\/$/, '');
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  return `${wordpressUrl}/wp-json/wc/v3`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    // Not configured — fall back to just the card flow rather than blocking checkout.
    return res.status(200).json({ success: true, methods: [DEFAULT_CARD_METHOD] });
  }

  try {
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const wcRes = await fetch(`${getWcApiUrl()}/payment_gateways`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });

    if (!wcRes.ok) {
      return res.status(200).json({ success: true, methods: [DEFAULT_CARD_METHOD] });
    }

    const gateways: WcPaymentGateway[] = await wcRes.json();
    const list = Array.isArray(gateways) ? gateways : [];

    // The headless card flow is always available regardless of WooCommerce's
    // "enabled" flag (it's driven entirely by this app's own code, not by
    // WooCommerce's checkout), but use WooCommerce's own title/description for
    // it when the 'authorize_net' gateway is registered there, since that's
    // where the store actually configures the label customers see.
    const wcCardEntry = list.find((g) => g.id === CARD_METHOD_ID);
    const cardMethod: CheckoutPaymentMethod = wcCardEntry
      ? { id: CARD_METHOD_ID, title: wcCardEntry.title || DEFAULT_CARD_METHOD.title, description: wcCardEntry.description || '' }
      : DEFAULT_CARD_METHOD;

    const extra = list
      .filter((g) => g.enabled && g.id !== CARD_METHOD_ID && !IGNORED_GATEWAY_IDS.has(g.id))
      .map((g) => ({ id: g.id, title: g.title || g.id, description: g.description || '' }));

    return res.status(200).json({ success: true, methods: [cardMethod, ...extra] });
  } catch (err) {
    console.error('[PaymentMethods] Failed to fetch WooCommerce gateways:', err);
    return res.status(200).json({ success: true, methods: [DEFAULT_CARD_METHOD] });
  }
}
