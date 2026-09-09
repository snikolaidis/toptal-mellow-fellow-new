/**
 * Payment Methods API
 *
 * GET: Returns the payment methods checkout should offer. The Authorize.net
 * card flow is always available (it's built into this app, not a WooCommerce
 * gateway), plus whatever else is currently enabled in WooCommerce > Settings
 * > Payments (e.g. Cash on Delivery, Sezzle) — so turning a gateway on/off in
 * wp-admin is enough to change what shows up here, no deploy required.
 *
 * Also returns `sezzleWidget` — the PDP "as low as $X with Sezzle" price
 * widget's config (whether it's on, and the merchant id it needs), read from
 * the same already-fetched Sezzle gateway settings. Reused here rather than
 * a second WooCommerce API call/OAuth-signing implementation, even though
 * this endpoint's name is checkout-flavored — see SezzlePriceWidget.tsx.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import type { CheckoutPaymentMethod } from '@/types/checkout';

interface WcPaymentGatewaySetting {
  value?: string;
}

interface WcPaymentGateway {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  settings?: Record<string, WcPaymentGatewaySetting>;
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
// still reports it enabled, but this storefront never talks to it. 'cod' has
// real completion code (see api/checkout.ts) but isn't a live offering right
// now — filtered out here entirely rather than left to show disabled/"Coming
// soon" in the picker.
const IGNORED_GATEWAY_IDS = new Set(['authnet', 'cod']);

// The installed Sezzle plugin registers its WooCommerce gateway as
// 'sezzlepay', not 'sezzle'. api/checkout.ts's startSezzleCheckout bridges to
// that plugin (via mf/v1/create-sezzle-order — see
// mellow-fellow-sezzle-gateway-bridge.php) rather than talking to Sezzle's
// API directly, but everything on the Next.js side still refers to it as
// 'sezzle' — remapped here so nothing else in the codebase needs to know the
// plugin's actual WooCommerce id.
const WC_GATEWAY_ID_ALIASES: Record<string, string> = { sezzlepay: 'sezzle' };

const DEFAULT_SEZZLE_WIDGET = { enabled: false, merchantId: '' };

function getWcApiUrl(): string {
  if (process.env.WC_API_URL) return process.env.WC_API_URL.replace(/\/$/, '');
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  return `${wordpressUrl}/wp-json/wc/v3`;
}

// WooCommerce's REST API only accepts Basic Auth over HTTPS — over plain HTTP
// (e.g. a local dev site) it silently returns 401 "cannot list resources" no
// matter how valid the key/secret are, and expects OAuth 1.0a query-string
// auth instead. See https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication-over-http
function oauthPercentEncode(str: string): string {
  // RFC 3986 encoding — encodeURIComponent leaves !*'() unescaped, OAuth 1.0a requires them escaped too.
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function signWcRequestUrl(method: string, url: string, consumerKey: string, consumerSecret: string): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };

  const sortedParams = Object.keys(oauthParams)
    .sort()
    .map((key) => `${oauthPercentEncode(key)}=${oauthPercentEncode(oauthParams[key])}`)
    .join('&');

  const baseString = [method.toUpperCase(), oauthPercentEncode(url), oauthPercentEncode(sortedParams)].join('&');
  // One-legged auth (no request/access token dance) — signing key is just the
  // consumer secret with an empty token secret after the '&'.
  const signingKey = `${oauthPercentEncode(consumerSecret)}&`;
  const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64');

  return `${url}?${sortedParams}&oauth_signature=${oauthPercentEncode(signature)}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    // Not configured — fall back to just the card flow rather than blocking checkout.
    return res.status(200).json({ success: true, methods: [DEFAULT_CARD_METHOD], sezzleWidget: DEFAULT_SEZZLE_WIDGET });
  }

  try {
    const baseUrl = `${getWcApiUrl()}/payment_gateways`;
    const isHttps = baseUrl.startsWith('https://');

    const wcRes = isHttps
      ? await fetch(baseUrl, {
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64'),
            Accept: 'application/json',
          },
        })
      : await fetch(signWcRequestUrl('GET', baseUrl, consumerKey, consumerSecret), {
          headers: { Accept: 'application/json' },
        });

    if (!wcRes.ok) {
      const body = await wcRes.text().catch(() => '');
      console.error(`[PaymentMethods] WooCommerce gateway list request failed (${wcRes.status}):`, body.slice(0, 500));
      return res.status(200).json({ success: true, methods: [DEFAULT_CARD_METHOD], sezzleWidget: DEFAULT_SEZZLE_WIDGET });
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
      .map((g) => ({
        id: WC_GATEWAY_ID_ALIASES[g.id] || g.id,
        title: g.title || g.id,
        description: g.description || '',
      }));

    const sezzleGateway = list.find((g) => g.id === 'sezzlepay');
    const sezzleWidget = sezzleGateway
      ? {
          enabled: sezzleGateway.settings?.['show-product-page-widget']?.value === 'yes',
          merchantId: sezzleGateway.settings?.['merchant-id']?.value || '',
        }
      : DEFAULT_SEZZLE_WIDGET;

    return res.status(200).json({ success: true, methods: [cardMethod, ...extra], sezzleWidget });
  } catch (err) {
    console.error('[PaymentMethods] Failed to fetch WooCommerce gateways:', err);
    return res.status(200).json({ success: true, methods: [DEFAULT_CARD_METHOD], sezzleWidget: DEFAULT_SEZZLE_WIDGET });
  }
}
