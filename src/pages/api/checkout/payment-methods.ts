/**
 * Payment Methods API
 *
 * GET: Returns the payment methods checkout should offer. The Authorize.net
 * card flow is always available (it's built into this app, not a WooCommerce
 * gateway), plus whatever else is currently enabled in WooCommerce > Settings
 * > Payments (e.g. Sezzle) — so turning a gateway on/off in wp-admin is
 * enough to change what shows up here, no deploy required.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { CheckoutPaymentMethod } from '@/types/checkout';
import { fetchWcPaymentGateways } from '@/lib/woocommerce';

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

// The installed Sezzle plugin registers its WooCommerce gateway as
// 'sezzlepay', not 'sezzle'. api/checkout.ts's startSezzleCheckout bridges to
// that plugin (via mf/v1/create-sezzle-order — see
// mellow-fellow-sezzle-gateway-bridge.php) rather than talking to Sezzle's
// API directly, but everything on the Next.js side still refers to it as
// 'sezzle' — remapped here so nothing else in the codebase needs to know the
// plugin's actual WooCommerce id.
const WC_GATEWAY_ID_ALIASES: Record<string, string> = { sezzlepay: 'sezzle' };
const SEZZLE_GATEWAY_ID = 'sezzlepay';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const list = await fetchWcPaymentGateways();

  if (list.length === 0) {
    // Not configured, or the WooCommerce API call failed — fall back to just
    // the card flow rather than blocking checkout.
    return res.status(200).json({ success: true, methods: [DEFAULT_CARD_METHOD] });
  }

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
    .map((g) => {
      const method: CheckoutPaymentMethod = {
        id: WC_GATEWAY_ID_ALIASES[g.id] || g.id,
        title: g.title || g.id,
        description: g.description || '',
      };
      // Sezzle's own "Minimum Checkout Amount" setting (wp-admin > WooCommerce
      // > Settings > Payments > Sezzle) is the actual source of truth for this
      // — read live here instead of duplicating it as a hardcoded constant
      // that could drift out of sync with what the store has configured.
      if (g.id === SEZZLE_GATEWAY_ID) {
        const raw = g.settings?.['min-checkout-amount']?.value;
        const parsed = raw ? parseFloat(raw) : 0;
        method.minAmount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      }
      return method;
    });

  return res.status(200).json({ success: true, methods: [cardMethod, ...extra] });
}
