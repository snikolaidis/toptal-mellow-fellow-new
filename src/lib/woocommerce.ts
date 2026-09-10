/**
 * Shared helpers for reading WooCommerce payment gateway config via the REST
 * API — used to read live settings (min order amount, merchant id, etc.)
 * from gateways the store configures in wp-admin, rather than hardcoding
 * values that can drift out of sync with what's actually configured there.
 */

import crypto from 'crypto';

export interface WcPaymentGatewaySetting {
  value?: string;
}

export interface WcPaymentGateway {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  settings?: Record<string, WcPaymentGatewaySetting>;
}

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

/**
 * Fetches all WooCommerce payment gateways (with their settings). Returns an
 * empty array on any failure (missing credentials, network error, non-2xx) —
 * callers should treat that the same as "nothing configured" rather than
 * throwing, since gateway config is advisory, not required for checkout to run.
 */
export async function fetchWcPaymentGateways(): Promise<WcPaymentGateway[]> {
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) return [];

  try {
    const baseUrl = `${getWcApiUrl()}/payment_gateways`;
    const isHttps = baseUrl.startsWith('https://');

    const res = isHttps
      ? await fetch(baseUrl, {
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64'),
            Accept: 'application/json',
          },
        })
      : await fetch(signWcRequestUrl('GET', baseUrl, consumerKey, consumerSecret), {
          headers: { Accept: 'application/json' },
        });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[WooCommerce] Gateway list request failed (${res.status}):`, body.slice(0, 500));
      return [];
    }

    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[WooCommerce] Failed to fetch payment gateways:', err);
    return [];
  }
}

export async function getWcPaymentGateway(id: string): Promise<WcPaymentGateway | null> {
  const gateways = await fetchWcPaymentGateways();
  return gateways.find((g) => g.id === id) || null;
}
