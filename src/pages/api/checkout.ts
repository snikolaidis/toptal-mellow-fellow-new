/**
 * Unified Checkout API Endpoint
 *
 * Handles the complete checkout flow:
 * 1. Validates request and applies security middleware (CSRF, rate limit, idempotency)
 * 2. Processes payment through Authorize.net FIRST
 * 3. Creates order in WooCommerce with isPaid=true and transactionId
 * 4. Logs reconciliation entries at each step
 *
 * Flow: Payment First → Order Creation
 * - If payment fails: No order is created, customer can retry
 * - If payment succeeds but order fails: Transaction logged for manual reconciliation
 * - Duplicate requests are handled via idempotency
 *
 * Note: We process payment first because WPGraphQL's updateOrder mutation requires
 * admin capabilities, which guest/customer sessions don't have.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  withPaymentProtection,
  startIdempotencyTracking,
  completeIdempotency,
  failIdempotency,
  IDEMPOTENCY_HEADER,
} from '@/lib/middleware';
import { getStorage } from '@/lib/storage';
import {
  makeHttpRequest,
  getWordPressGraphQLUrl,
} from '@/lib/http';
import { CheckoutError, ErrorCode, logError } from '@/lib/errors';
import {
  createProfileFromTransaction,
  chargeProfile,
  getSavedCards,
  stableRefId,
  getTransactionByRefId,
} from '@/lib/authorize-net-cim';

// ============================================================================
// Types
// ============================================================================

interface CheckoutRequest {
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping?: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  paymentNonce?: {
    dataDescriptor: string;
    dataValue: string;
  };
  savedCard?: {
    customerProfileId: string;
    paymentProfileId: string;
  };
  saveCard?: boolean;
  subscription?: {
    period: string;
    interval: number;
  };
  subscriptionItems?: Array<{ productId: number; period: string; interval: number }>;
  amount: string;
  coupons?: string[];
  // Sum of every bundled line's (original - discounted) total — recorded on
  // the order as a "Bundle Discount" line, the same way a coupon is.
  bundleDiscountTotal?: number;
  items: Array<{
    productId: number;
    name: string;
    quantity: number;
    price: string;
    // Present only when this line item was added as part of a bundle group
    // (see CartContext bbGroupKey/bbBundleId) — forwarded to mf/v1/create-order
    // so it can be recorded as order item meta.
    bundleName?: string;
    // Pre-discount unit price for bundled items — lets the order line show
    // as discounted (subtotal vs. total) instead of a flat charged price.
    regularUnitPrice?: number;
  }>;
  sources?: Record<string, string>;
  // Forwarded to mf/v1/create-order so the WP-side guard can independently
  // re-confirm Real ID verification before the order is created — see
  // mellow-fellow-realid-order-guard.php.
  realIdCheckId?: string;
  // "Forgot Something?" order-confirmation add-on: a claim that this
  // checkout should get free shipping because it's a follow-up to an
  // order placed within the last few minutes. Never trusted as-is —
  // see validateShippingWaiver, which independently re-confirms
  // ownership (billing email) and the time window against the
  // referenced order before any shipping is actually waived.
  waiverOrderId?: string;
  waiverOrderKey?: string;
}

interface PendingOrder {
  id: string;
  databaseId: number;
  orderNumber: string;
  orderKey?: string;
  status: string;
  total: string;
}

interface PaymentResult {
  transactionId: string;
  authCode: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate checkout request body
 */
function validateCheckoutRequest(body: CheckoutRequest): string | null {
  if (!body.billing) {
    return 'Billing information is required';
  }
  if (!body.billing.firstName || !body.billing.lastName) {
    return 'Billing name is required';
  }
  if (!body.billing.email) {
    return 'Email is required';
  }
  if (!body.billing.address1 || !body.billing.city || !body.billing.state || !body.billing.postcode) {
    return 'Complete billing address is required';
  }
  const hasNonce = body.paymentNonce?.dataDescriptor && body.paymentNonce?.dataValue;
  const hasSavedCard = body.savedCard?.customerProfileId && body.savedCard?.paymentProfileId;
  if (!hasNonce && !hasSavedCard) {
    return 'Payment information is required';
  }
  if (!body.amount) {
    return 'Order amount is required';
  }
  return null;
}

/**
 * Get auth context: JWT for fast identity, Faust exchange only when WPGraphQL token is needed.
 */
async function getAuthFromRequest(req: NextApiRequest): Promise<{ userId: number; accessToken?: string } | null> {
  const cookies = req.headers.cookie || '';

  // Fast path: JWT gives us userId without a network call
  const { verifyJwt, extractJwt } = await import('@/lib/jwt-auth');
  const { validateSession } = await import('@/lib/session-manager');
  const jwt = extractJwt(cookies);
  if (jwt) {
    const result = verifyJwt(jwt);
    if (result && (await validateSession(result.sessionId))) {
      // Lazily get WPGraphQL access token only when needed downstream
      try {
        const { exchangeRefreshToken } = await import('@/lib/faust-auth');
        const tokens = await exchangeRefreshToken(cookies);
        return { userId: result.userId, accessToken: tokens?.accessToken };
      } catch {
        return { userId: result.userId };
      }
    }
  }

  // Fallback: full Faust exchange
  try {
    const { getAuthenticatedUserId } = await import('@/lib/faust-auth');
    const auth = await getAuthenticatedUserId(cookies);
    if (auth) return { userId: auth.userId, accessToken: auth.accessToken };
  } catch {
    // fall through
  }

  return null;
}

function parseMoney(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return NaN;
  return parseFloat(String(value).replace(/[^0-9.]/g, ''));
}

function extractCartToken(cookies: string): string | null {
  const match = cookies.match(/wc_cart_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function storeApiFetch(
  path: string,
  cartToken: string | null,
  options: { method?: string; body?: Record<string, unknown> } = {}
): Promise<{ status: number; data: any }> {
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const url = `${wordpressUrl}/wp-json/wc/store/v1/${path}`;
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (cartToken) headers['Cart-Token'] = cartToken;
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function applyCouponsToSession(
  req: NextApiRequest,
  codes: string[],
  _authToken?: string
): Promise<void> {
  if (!codes || codes.length === 0) return;

  const cookies = req.headers.cookie || '';
  const cartToken = extractCartToken(cookies);

  for (const code of codes) {
    if (!code) continue;
    try {
      const response = await storeApiFetch('cart/apply-coupon', cartToken, {
        method: 'POST',
        body: { code },
      });
      if (response.status >= 400) {
        console.log(`[Checkout] applyCoupon "${code}": ${response.data?.message || 'unknown error'}`);
      } else {
        console.log(`[Checkout] Coupon "${code}" applied via Store API`);
      }
    } catch (err) {
      console.error(`[Checkout] Failed to apply coupon "${code}":`, err);
    }
  }
}

interface ServerCartItemTotal {
  productId: number;
  variationId: number;
  quantity: number;
  lineSubtotal: number;
  lineTotal: number;
}

interface ServerCartCoupon {
  code: string;
  discount: number;
}

interface ServerCart {
  total: number;
  discountTotal: number;
  shipping: number;
  itemTotals: ServerCartItemTotal[];
  coupons: ServerCartCoupon[];
}

async function getServerCartTotal(
  req: NextApiRequest,
  _authToken?: string
): Promise<ServerCart | null> {
  const cookies = req.headers.cookie || '';
  const cartToken = extractCartToken(cookies);

  try {
    const response = await storeApiFetch('cart', cartToken);

    if (response.status >= 400 || !response.data) {
      console.warn('[Checkout] Store API cart unavailable:', response.status);
      return null;
    }

    const cart = response.data;
    if (!cart.items || cart.items.length === 0) {
      console.warn('[Checkout] Store API cart is empty');
      return null;
    }

    const minorUnit = cart.totals?.currency_minor_unit ?? 2;
    const divisor = Math.pow(10, minorUnit);
    const total = (parseInt(String(cart.totals?.total_price ?? '0'), 10) || 0) / divisor;
    if (isNaN(total) || total <= 0) return null;

    const discountTotal = (parseInt(String(cart.totals?.total_discount ?? '0'), 10) || 0) / divisor;
    const shipping = (parseInt(String(cart.totals?.total_shipping ?? '0'), 10) || 0) / divisor;

    const itemTotals: ServerCartItemTotal[] = (cart.items || []).map((item: any) => ({
      productId: item.id || 0,
      variationId: item.variation?.[0]?.attribute ? (item.id || 0) : 0,
      quantity: item.quantity || 1,
      lineSubtotal: (parseInt(String(item.totals?.line_subtotal ?? '0'), 10) || 0) / divisor,
      lineTotal: (parseInt(String(item.totals?.line_total ?? '0'), 10) || 0) / divisor,
    }));

    const coupons: ServerCartCoupon[] = (cart.coupons || []).map((c: any) => ({
      code: String(c.code || ''),
      discount: (parseInt(String(c.totals?.total_discount ?? '0'), 10) || 0) / divisor,
    }));

    return {
      total,
      discountTotal: isNaN(discountTotal) ? 0 : discountTotal,
      shipping: isNaN(shipping) ? 0 : shipping,
      itemTotals,
      coupons,
    };
  } catch (err) {
    console.error('[Checkout] Failed to read Store API cart total:', err);
    return null;
  }
}

// Must match the window order-confirmation.tsx shows/enforces client-side -
// that's only ever a display hint though; this is the actual enforcement.
const SHIPPING_WAIVER_WINDOW_MS = 10 * 60 * 1000;

/**
 * Re-confirm, independently of anything the client claims, that this
 * checkout is genuinely a "Forgot Something?" follow-up to an order
 * the same customer placed within the last 10 minutes - both facts
 * are read straight from the referenced order via the same
 * order-id + order-key trust boundary order-items.php already uses
 * for guest order lookups, never from client-supplied values.
 */
async function validateShippingWaiver(
  waiverOrderId: string,
  waiverOrderKey: string,
  billingEmail: string
): Promise<boolean> {
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  if (!wordpressUrl || !waiverOrderId || !waiverOrderKey) return false;

  try {
    const res = await fetch(
      `${wordpressUrl}/wp-json/mellow-fellow/v1/order-items?order_id=${encodeURIComponent(waiverOrderId)}&key=${encodeURIComponent(waiverOrderKey)}`
    );
    if (!res.ok) return false;

    const data = await res.json();
    if (!data?.success || typeof data?.ageSeconds !== 'number' || !data?.billingEmail) {
      return false;
    }

    // ageSeconds is computed entirely server-side (PHP) from two
    // timestamps on the same clock - deliberately not re-derived here
    // from an absolute "created at" value compared against this
    // process's own clock/timezone (that combination is what
    // previously made the waiver appear expired the instant an order
    // was placed - see mellow-fellow-order-items.php).
    const ageMs = data.ageSeconds * 1000;
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > SHIPPING_WAIVER_WINDOW_MS) {
      return false;
    }

    return (
      String(data.billingEmail).trim().toLowerCase() ===
      String(billingEmail || '').trim().toLowerCase()
    );
  } catch (err) {
    console.warn('[Checkout] Shipping waiver validation failed:', err);
    return false;
  }
}

async function voidPayment(transactionId: string): Promise<boolean> {
  const apiLoginId = process.env.NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY;
  const environment = process.env.NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT || 'sandbox';

  if (!apiLoginId || !transactionKey) return false;

  const payload = {
    createTransactionRequest: {
      merchantAuthentication: { name: apiLoginId, transactionKey },
      transactionRequest: {
        transactionType: 'voidTransaction',
        refTransId: transactionId,
      },
    },
  };

  const apiUrl =
    environment === 'production'
      ? 'https://api.authorize.net/xml/v1/request.api'
      : 'https://apitest.authorize.net/xml/v1/request.api';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    const ok =
      result.messages?.resultCode === 'Ok' &&
      result.transactionResponse?.responseCode === '1';
    if (!ok) {
      console.error('[Checkout] Void failed:', JSON.stringify(result.messages));
    }
    return ok;
  } catch (err) {
    console.error('[Checkout] Void request error:', err);
    return false;
  }
}

type SchemeInfo = { period: string; interval: number; price: string };

async function getSchemesByProduct(
  items: Array<{ productId: number }>,
  authToken?: string
): Promise<Record<number, Array<SchemeInfo>>> {
  try {
    const ids = (items || [])
      .map((i) => Number(i.productId))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return {};
    const fields = ids
      .map(
        (id, i) =>
          `p${i}: product(id: ${id}, idType: DATABASE_ID) { ` +
          `... on SimpleProduct { subscriptionSchemes { period interval price } } ` +
          `... on VariableProduct { subscriptionSchemes { period interval price } } }`
      )
      .join('\n');
    const res = await makeHttpRequest({
      url: getWordPressGraphQLUrl(),
      body: JSON.stringify({ query: `{ ${fields} }` }),
      authToken,
    });
    const data = res.data?.data || {};
    const map: Record<number, Array<SchemeInfo>> = {};
    ids.forEach((id, i) => {
      const schemes = data[`p${i}`]?.subscriptionSchemes;
      map[id] = Array.isArray(schemes)
        ? schemes.map((x: { period?: string; interval?: number; price?: string }) => ({
            period: String(x.period),
            interval: Number(x.interval),
            price: String(x.price ?? ''),
          }))
        : [];
    });
    return map;
  } catch {
    return {};
  }
}

type SubscriptionLine = { productId: number; quantity: number; unitPrice: number };

function buildSubscriptionLines(
  body: CheckoutRequest,
  schemesByProduct: Record<number, Array<SchemeInfo>>
): { lines: SubscriptionLine[]; savings: number; period: string; interval: number } | null {
  const wanted = Array.isArray(body.subscriptionItems) ? body.subscriptionItems : [];
  if (!wanted.length) return null;
  const period = String(wanted[0].period);
  const interval = Number(wanted[0].interval);
  if (!period || interval < 1) return null;
  const wantedIds = new Set(
    wanted
      .filter((w) => String(w.period) === period && Number(w.interval) === interval)
      .map((w) => Number(w.productId))
  );
  const lines: SubscriptionLine[] = [];
  let savings = 0;
  for (const item of body.items || []) {
    const pid = Number(item.productId);
    if (!wantedIds.has(pid)) continue;
    const qty = Math.max(1, Number(item.quantity) || 1);
    const scheme = (schemesByProduct[pid] || []).find(
      (s) => s.period === period && s.interval === interval
    );
    const unitPrice = scheme ? parseFloat(String(scheme.price)) : NaN;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      console.warn(
        `[Checkout][SUB] Product ${pid} was selected for subscription (${interval} ${period}) but has no matching live scheme; charging it as one-time.`
      );
      continue;
    }
    const fullUnit = parseFloat(String(item.price).replace(/[^0-9.]/g, '')) || 0;
    lines.push({ productId: pid, quantity: qty, unitPrice });
    savings += Math.max(0, (fullUnit - unitPrice) * qty);
  }
  if (!lines.length) return null;
  return { lines, savings: Math.round(savings * 100) / 100, period, interval };
}

async function createSubscriptionOrder(
  body: CheckoutRequest,
  transactionId: string,
  scheme: { period: string; interval: number },
  lines: SubscriptionLine[] | null,
  shippingCost: number,
  authToken?: string
): Promise<PendingOrder> {
  if (!authToken) {
    throw new CheckoutError('Subscriptions require a logged-in customer.', ErrorCode.VALIDATION_ERROR);
  }
  const viewerRes = await makeHttpRequest({
    url: getWordPressGraphQLUrl(),
    body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
    authToken,
  });
  const wpUserId = viewerRes.data?.data?.viewer?.databaseId;
  if (!wpUserId) {
    console.error('[Checkout][SUB] viewer lookup returned no databaseId; authToken present:', !!authToken);
    throw new CheckoutError('Could not identify the customer for the subscription.', ErrorCode.VALIDATION_ERROR);
  }

  let customerProfileId = body.savedCard?.customerProfileId || '';
  let paymentProfileId = body.savedCard?.paymentProfileId || '';
  if (!customerProfileId || !paymentProfileId) {
    try {
      const profile = await createProfileFromTransaction(transactionId, String(wpUserId), body.billing.email);
      customerProfileId = profile.customerProfileId;
      paymentProfileId = profile.paymentProfileId;
    } catch (cimErr) {
      const m = cimErr instanceof Error ? cimErr.message : String(cimErr);
      console.error('[Checkout][SUB] CIM profile creation threw:', m);
      throw new CheckoutError(`Could not save the card for recurring billing: ${m}`, ErrorCode.VALIDATION_ERROR);
    }
  }
  if (!customerProfileId || !paymentProfileId) {
    console.error('[Checkout][SUB] Missing CIM ids after profile step:', { customerProfileId, paymentProfileId });
    throw new CheckoutError('Could not save the card for recurring billing.', ErrorCode.VALIDATION_ERROR);
  }

  const wpBaseUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const faustSecret = process.env.FAUST_SECRET_KEY;
  const res = await fetch(`${wpBaseUrl}/wp-json/mf/v1/create-subscription-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${faustSecret}` },
    body: JSON.stringify({
      wpUserId,
      billing: body.billing,
      shipping: body.shipping || body.billing,
      items: body.items,
      lines: lines || [],
      shippingCost,
      transactionId,
      period: scheme.period,
      interval: scheme.interval,
      customerProfileId,
      paymentProfileId,
      realIdCheckId: body.realIdCheckId,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data?.orderId) {
    const msg = data?.message || data?.error || `subscription order failed (${res.status})`;
    console.error('[Checkout][SUB] create-subscription-order returned no orderId. status:', res.status, 'body:', data);
    throw new CheckoutError(`Subscription order creation failed: ${msg}`, ErrorCode.VALIDATION_ERROR);
  }
  return {
    id: String(data.orderId),
    databaseId: Number(data.orderId),
    orderNumber: String(data.orderNumber || data.orderId),
    orderKey: data.orderKey ? String(data.orderKey) : undefined,
    status: 'processing',
    total: String(data.total || body.amount),
  };
}

/**
 * Create order in WooCommerce via REST endpoint with payment already processed.
 * Uses the /mf/v1/create-order endpoint which accepts explicit line items,
 * decoupling order creation from any specific cart session mechanism.
 */
async function createOrderWithPayment(
  req: NextApiRequest,
  body: CheckoutRequest,
  transactionId: string,
  customerId: number,
  authToken?: string,
  serverCart?: ServerCart | null,
  shippingWaiverValid?: boolean
): Promise<PendingOrder> {
  const wpBaseUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const faustSecret = process.env.FAUST_SECRET_KEY;

  if (!faustSecret) {
    throw new CheckoutError('Server configuration error', ErrorCode.ORDER_CREATION_FAILED);
  }

  // Build shipping lines from Store API cart
  const cookies = req.headers.cookie || '';
  const cartToken = extractCartToken(cookies);
  let shippingLines: Array<{ methodTitle: string; methodId: string; total: number }> = [];
  if (cartToken) {
    try {
      const cartRes = await storeApiFetch('cart', cartToken);
      const shippingRates = cartRes.data?.shipping_rates || [];
      const minorUnit = cartRes.data?.totals?.currency_minor_unit ?? 2;
      const divisor = Math.pow(10, minorUnit);
      for (const pkg of shippingRates) {
        const selected = (pkg.shipping_rates || []).find((r: any) => r.selected);
        if (selected) {
          shippingLines.push({
            methodTitle: selected.name || 'Shipping',
            methodId: selected.rate_id || 'flat_rate',
            // Zeroed when a validated "Forgot Something?" waiver
            // applies (see validateShippingWaiver in the main
            // handler) - the method name is kept so the order still
            // shows what would have been used.
            total: shippingWaiverValid
              ? 0
              : (parseInt(String(selected.price ?? '0'), 10) || 0) / divisor,
          });
        }
      }
    } catch (err) {
      console.warn('[Checkout] Could not read shipping from Store API:', err);
    }
  }

  console.log('[Checkout] Creating order via /mf/v1/create-order...', authToken ? '(authenticated)' : '(guest)');
  console.log('[Checkout][RealID] body.realIdCheckId =', JSON.stringify(body.realIdCheckId));

  const orderPayload = {
    billing: body.billing,
    shipping: body.shipping || body.billing,
    items: (body.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      variationId: (item as any).variationId || undefined,
      unitPrice: (item as any).unitPrice || undefined,
      bundleName: item.bundleName || undefined,
      regularUnitPrice: item.regularUnitPrice || undefined,
    })),
    transactionId,
    paymentMethod: 'authorize_net',
    couponCodes: body.coupons || [],
    shippingLines,
    customerId,
    metaData: [
      { key: '_transaction_id', value: transactionId },
      { key: '_authorize_net_transaction_id', value: transactionId },
      { key: '_payment_method', value: 'authnet' },
      { key: '_payment_method_title', value: 'Credit Card (Authorize.net)' },
    ],
    realIdCheckId: body.realIdCheckId,
    cartItemTotals: serverCart?.itemTotals || [],
    cartCoupons: serverCart?.coupons || [],
    bundleDiscountTotal: body.bundleDiscountTotal || undefined,
  };

  console.log('[Checkout][RealID] orderPayload.realIdCheckId =', JSON.stringify(orderPayload.realIdCheckId));

  const response = await fetch(`${wpBaseUrl}/wp-json/mf/v1/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${faustSecret}`,
    },
    body: JSON.stringify(orderPayload),
  });

  const data = await response.json().catch(() => null);

  console.log('[Checkout] Order endpoint response:', response.status, JSON.stringify(data).substring(0, 500));

  if (!data?.success || !data?.orderId) {
    const msg = data?.message || `Order creation failed (${response.status})`;
    console.error('[Checkout] Order creation failed:', msg);
    throw new CheckoutError(msg, ErrorCode.ORDER_CREATION_FAILED, { transactionId });
  }

  console.log(`[Checkout] Order created: ${data.orderNumber} (ID: ${data.orderId}) with transaction ${transactionId}`);

  return {
    id: String(data.orderId),
    databaseId: Number(data.orderId),
    orderNumber: String(data.orderNumber || data.orderId),
    orderKey: data.orderKey ? String(data.orderKey) : undefined,
    status: data.status || 'processing',
    total: String(data.total || body.amount),
  };
}

/**
 * Update customer's saved billing and shipping addresses after successful checkout
 * Only runs for authenticated users
 */
async function updateCustomerAddresses(
  req: NextApiRequest,
  body: CheckoutRequest,
  authToken: string
): Promise<void> {
  const graphqlUrl = getWordPressGraphQLUrl();
  const cookies = req.headers.cookie || '';

  // Determine shipping address (use billing if same as billing)
  const shippingAddress = body.shipping || body.billing;

  const mutation = `
    mutation UpdateCustomer($input: UpdateCustomerInput!) {
      updateCustomer(input: $input) {
        customer {
          id
          billing {
            firstName
            lastName
            email
          }
          shipping {
            firstName
            lastName
            address1
          }
        }
      }
    }
  `;

  const variables = {
    input: {
      billing: {
        firstName: body.billing.firstName,
        lastName: body.billing.lastName,
        email: body.billing.email,
        phone: body.billing.phone || '',
        address1: body.billing.address1,
        address2: body.billing.address2 || '',
        city: body.billing.city,
        state: body.billing.state,
        postcode: body.billing.postcode,
        country: body.billing.country,
      },
      shipping: {
        firstName: shippingAddress.firstName,
        lastName: shippingAddress.lastName,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        postcode: shippingAddress.postcode,
        country: shippingAddress.country,
      },
    },
  };

  try {
    console.log('[Checkout] Saving customer addresses...');

    const response = await makeHttpRequest({
      url: graphqlUrl,
      body: JSON.stringify({ query: mutation, variables }),
      cookies,
      authToken,
    });

    if (response.data?.errors) {
      console.error('[Checkout] Failed to save customer addresses:', response.data.errors);
      // Don't throw - this is a non-critical operation
    } else {
      console.log('[Checkout] Customer addresses saved successfully');
    }
  } catch (err) {
    // Log but don't fail checkout if address save fails
    console.error('[Checkout] Error saving customer addresses:', err);
  }
}

/**
 * Process payment through Authorize.net
 * Payment is processed BEFORE order creation to avoid permission issues with order updates
 */
async function processPayment(
  body: CheckoutRequest,
  chargeAmount: number,
  idempotencyKey?: string
): Promise<PaymentResult> {
  const apiLoginId = process.env.NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY;
  const environment = process.env.NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT || 'sandbox';

  if (!apiLoginId || !transactionKey) {
    throw new CheckoutError(
      'Payment service not configured',
      ErrorCode.PAYMENT_PROCESSING_ERROR
    );
  }

  const amount = chargeAmount;
  if (isNaN(amount) || amount <= 0) {
    throw new CheckoutError(
      'Invalid order amount',
      ErrorCode.VALIDATION_ERROR
    );
  }

  // Saved card: use CIM charge (no opaqueData needed)
  if (body.savedCard) {
    console.log('[Checkout] Charging saved card...');
    const result = await chargeProfile(
      body.savedCard.customerProfileId,
      body.savedCard.paymentProfileId,
      amount.toFixed(2),
      idempotencyKey
    );
    return result;
  }

  // New card: use opaqueData from Accept.js
  if (!body.paymentNonce) {
    throw new CheckoutError('Payment information is required', ErrorCode.VALIDATION_ERROR);
  }

  // Build line items (Authorize.net limits to 30)
  const lineItems = body.items?.slice(0, 30).map((item, index) => ({
    itemId: (index + 1).toString(),
    name: item.name.substring(0, 31),
    description: item.name.substring(0, 255),
    quantity: item.quantity.toString(),
    unitPrice: parseFloat(item.price.replace(/[^0-9.]/g, '')).toFixed(2),
  }));

  const refId = stableRefId(idempotencyKey, `checkout_${body.billing.email}_${amount.toFixed(2)}`);

  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: apiLoginId,
        transactionKey: transactionKey,
      },
      refId,
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: amount.toFixed(2),
        payment: {
          opaqueData: {
            dataDescriptor: body.paymentNonce.dataDescriptor,
            dataValue: body.paymentNonce.dataValue,
          },
        },
        order: {
          invoiceNumber: refId,
          description: `Purchase from ${process.env.NEXT_PUBLIC_SITE_NAME || 'Store'}`,
        },
        lineItems: lineItems?.length ? { lineItem: lineItems } : undefined,
        customer: {
          email: body.billing.email,
        },
        billTo: {
          firstName: body.billing.firstName,
          lastName: body.billing.lastName,
          address: body.billing.address1,
          city: body.billing.city,
          state: body.billing.state,
          zip: body.billing.postcode,
          country: body.billing.country,
          phoneNumber: body.billing.phone,
        },
        shipTo: body.shipping
          ? {
              firstName: body.shipping.firstName,
              lastName: body.shipping.lastName,
              address: body.shipping.address1,
              city: body.shipping.city,
              state: body.shipping.state,
              zip: body.shipping.postcode,
              country: body.shipping.country,
            }
          : undefined,
        transactionSettings: {
          setting: [
            {
              settingName: 'duplicateWindow',
              settingValue: '60',
            },
          ],
        },
      },
    },
  };

  const apiUrl =
    environment === 'production'
      ? 'https://api.authorize.net/xml/v1/request.api'
      : 'https://apitest.authorize.net/xml/v1/request.api';

  console.log(`[Checkout] Processing payment...`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  // Check for success (responseCode 1 = Approved)
  const isDuplicate =
    result.transactionResponse?.errors?.[0]?.errorCode === '11' ||
    result.messages?.message?.[0]?.code === 'E00027';
  if (
    result.messages?.resultCode !== 'Ok' ||
    result.transactionResponse?.responseCode !== '1'
  ) {
    if (isDuplicate) {
      console.warn(`[Checkout] E00027 duplicate on refId ${refId}; reconciling instead of re-charging.`);
      const prior = await getTransactionByRefId(refId);
      if (prior?.transId) {
        console.warn(`[Checkout] Reconciled duplicate to prior transaction ${prior.transId}.`);
        return { transactionId: prior.transId, authCode: '' };
      }
      throw new CheckoutError(
        'A duplicate payment was detected but the original could not be confirmed. Do not retry; please contact support.',
        ErrorCode.PAYMENT_DUPLICATE_UNRESOLVED,
        { refId }
      );
    }

    const errorMessage =
      result.transactionResponse?.errors?.[0]?.errorText ||
      result.messages?.message?.[0]?.text ||
      'Payment was declined';

    console.error(`[Checkout] Payment failed: ${errorMessage}`);

    throw new CheckoutError(errorMessage, ErrorCode.PAYMENT_DECLINED);
  }

  console.log(`[Checkout] Payment successful: ${result.transactionResponse.transId}`);

  return {
    transactionId: result.transactionResponse.transId,
    authCode: result.transactionResponse.authCode,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

async function checkoutHandler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const storage = await getStorage();
  const idempotencyKey = req.headers[IDEMPOTENCY_HEADER] as string | undefined;
  let orderId: string | undefined;
  let orderNumber: string | undefined;
  let transactionId: string | undefined;

  // Start idempotency tracking if key provided
  const trackingKey = await startIdempotencyTracking(req, res, { required: false });
  // If response was already sent (duplicate request), exit
  if (trackingKey === null && idempotencyKey) {
    return;
  }

  try {
    const body: CheckoutRequest = req.body;

    // Validate request
    const validationError = validateCheckoutRequest(body);
    if (validationError) {
      const errorResponse = {
        success: false,
        message: validationError,
        code: 'VALIDATION_ERROR',
      };
      if (trackingKey) {
        await failIdempotency(trackingKey, errorResponse);
      }
      res.status(400).json(errorResponse);
      return;
    }

    // Get auth context: userId from JWT (instant), access token from Faust (lazy)
    const authCtx = await getAuthFromRequest(req);
    const authToken = authCtx?.accessToken;

    await storage.createReconciliationEntry({
      orderId: 'pending',
      amount: body.amount,
      status: 'pending',
      eventType: 'checkout_started',
      metadata: JSON.stringify({ email: body.billing.email, isAuthenticated: !!authCtx }),
    });

    await applyCouponsToSession(req, body.coupons || [], authToken);

    let serverCart = await getServerCartTotal(req, authToken);
    const browserAmount = parseMoney(body.amount);

    if (serverCart && body.items) {
      const serverQty = serverCart.itemTotals.reduce((s, t) => s + t.quantity, 0);
      const bodyQty = (body.items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0);
      if (serverQty !== bodyQty) {
        console.warn(
          `[Checkout] Cart sync mismatch: server cart has ${serverQty} items, checkout sent ${bodyQty}. ` +
          `Falling back to browser amount.`
        );
        serverCart = null;
      }
    }

    let chargeAmount = serverCart ? serverCart.total : browserAmount;

    if (isNaN(chargeAmount) || chargeAmount <= 0) {
      throw new CheckoutError(
        'Could not determine a valid amount to charge',
        ErrorCode.VALIDATION_ERROR
      );
    }

    // "Forgot Something?" shipping waiver - re-validated independently
    // of anything the client claims (see validateShippingWaiver).
    // Deducted here, from the same server-derived shipping figure
    // createOrderWithPayment uses to build the order's shipping
    // lines, so the amount actually charged always matches what
    // the order records.
    let shippingWaiverValid = false;
    if (body.waiverOrderId && body.waiverOrderKey) {
      shippingWaiverValid = await validateShippingWaiver(
        body.waiverOrderId,
        body.waiverOrderKey,
        body.billing.email
      );
      if (shippingWaiverValid && serverCart) {
        chargeAmount = Math.max(0, chargeAmount - Math.max(0, serverCart.shipping));
      }
    }

    let subscriptionScheme: { period: string; interval: number } | null = null;
    let subscriptionLines: SubscriptionLine[] | null = null;
    let subscriptionShipping = 0;
    if (Array.isArray(body.subscriptionItems) && body.subscriptionItems.length > 0) {
      const schemesByProduct = await getSchemesByProduct(body.items, authToken);
      const priced = buildSubscriptionLines(body, schemesByProduct);
      if (priced) {
        subscriptionScheme = { period: priced.period, interval: priced.interval };
        subscriptionLines = priced.lines;
        subscriptionShipping =
          serverCart && !shippingWaiverValid
            ? Math.max(0, serverCart.shipping)
            : 0;
        // (Mirrors the same serverCart-gating used for the non-subscription
        // path below: shipping is only ever recorded as waived when the
        // charge itself was actually reduced by that same amount.)
        chargeAmount = Math.max(0, Math.round((chargeAmount - priced.savings) * 100) / 100);
      }
    }

    const amountSource =
      subscriptionScheme && subscriptionLines ? 'subscription' : serverCart ? 'server cart' : 'browser fallback';
    console.log(
      `[Checkout] Charge amount resolved to ${chargeAmount.toFixed(2)} ` +
        `(source: ${amountSource}, browser said ${browserAmount})`
    );

    const paymentResult = await processPayment(body, chargeAmount, idempotencyKey);
    transactionId = paymentResult.transactionId;

    await storage.createReconciliationEntry({
      orderId: 'pending',
      transactionId,
      amount: chargeAmount.toFixed(2),
      status: 'payment_success',
      eventType: 'payment_success',
    });

    let order: PendingOrder;
    if (subscriptionScheme) {
      order = await createSubscriptionOrder(body, transactionId, subscriptionScheme, subscriptionLines, subscriptionShipping, authToken);
    } else {
      order = await createOrderWithPayment(req, body, transactionId, authCtx?.userId || 0, authToken, serverCart, shippingWaiverValid && !!serverCart);
    }
    orderId = order.databaseId.toString();
    orderNumber = order.orderNumber;

    const orderTotal = parseMoney(order.total);
    if (!isNaN(orderTotal) && Math.abs(orderTotal - chargeAmount) > 0.01) {
      console.error(
        `[Checkout] AMOUNT MISMATCH: charged ${chargeAmount.toFixed(2)} but order ` +
          `${orderNumber} total is ${orderTotal.toFixed(2)}. Voiding transaction ${transactionId}.`
      );
      const voided = await voidPayment(transactionId);

      // Cancel the order so it doesn't persist as "processing"
      try {
        const wpBaseUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
        const faustSecret = process.env.FAUST_SECRET_KEY;
        await fetch(`${wpBaseUrl}/wp-json/wc/v3/orders/${order.databaseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${faustSecret}`,
          },
          body: JSON.stringify({ status: 'failed' }),
        });
        console.log(`[Checkout] Order ${orderNumber} set to failed after mismatch.`);
      } catch (cancelErr) {
        console.error(`[Checkout] Could not cancel order ${orderNumber}:`, cancelErr);
      }

      await storage.createReconciliationEntry({
        orderId,
        orderNumber,
        transactionId,
        amount: chargeAmount.toFixed(2),
        status: 'mismatch',
        eventType: 'amount_mismatch',
        metadata: JSON.stringify({
          chargeAmount: chargeAmount.toFixed(2),
          orderTotal: orderTotal.toFixed(2),
          voided,
          reason: 'order total did not match charged amount',
        }),
      });

      throw new CheckoutError(
        'Order total did not match the amount charged. The payment was reversed. Please try again or contact support.',
        ErrorCode.PAYMENT_ORDER_MISMATCH,
        { orderId, transactionId, chargeAmount, orderTotal, voided }
      );
    }

    await storage.createReconciliationEntry({
      orderId,
      orderNumber,
      transactionId,
      amount: chargeAmount.toFixed(2),
      status: 'payment_success',
      eventType: 'order_created',
      metadata: JSON.stringify({
        orderStatus: order.status,
        paymentIncluded: true,
        orderTotal: orderTotal.toFixed(2),
        discountTotal: serverCart ? serverCart.discountTotal.toFixed(2) : undefined,
      }),
    });

    // STEP 3: Save customer addresses (non-blocking — don't delay the success response)
    if (authToken) {
      updateCustomerAddresses(req, body, authToken).catch((err) =>
        console.error('[Checkout] Address save failed (non-blocking):', err)
      );
    }

    // Send success response IMMEDIATELY — customer sees confirmation now.
    // All post-checkout work (CIM, subscriptions) happens after response is sent.
    const successResponse = {
      success: true,
      orderId: orderNumber || orderId,
      orderDatabaseId: order.databaseId,
      orderKey: order.orderKey,
      transactionId,
      amountCharged: chargeAmount.toFixed(2),
    };

    if (trackingKey) {
      await completeIdempotency(trackingKey, successResponse, orderId, transactionId);
    }

    console.log(`[Checkout] Checkout complete: Order ${orderNumber}, Transaction ${transactionId}`);
    res.status(200).json(successResponse);

    if (body.sources && Object.keys(body.sources).length > 0 && order.databaseId) {
      (async () => {
        try {
          const wpBaseUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
          const faustSecret = process.env.FAUST_SECRET_KEY;
          await fetch(`${wpBaseUrl}/wp-json/mf/v1/attribute-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${faustSecret}` },
            body: JSON.stringify({ orderId: order.databaseId, sources: body.sources }),
          });
        } catch (err) {
          console.error('[Checkout] Attribution failed (non-blocking):', err);
        }
      })();
    }

    // === POST-RESPONSE WORK (customer already has their confirmation) ===

    // STEP 4: Create CIM profile + handle subscriptions in the background
    if (authCtx && body.saveCard && !body.savedCard && transactionId && !subscriptionScheme) {
      (async () => {
        try {
          const wpUserId = authCtx.userId;
          console.log(`[CIM] Using JWT userId=${wpUserId}`);

          if (wpUserId) {
            const profile = await createProfileFromTransaction(
              transactionId,
              String(wpUserId),
              body.billing.email
            );

            if (profile.customerProfileId && profile.paymentProfileId) {
              // Get card details from the profile
              const cards = await getSavedCards(profile.customerProfileId);
              const newCard = cards.find((c) => c.paymentProfileId === profile.paymentProfileId);

              // Save to WordPress user meta
              const wpBaseUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
              const faustSecret = process.env.FAUST_SECRET_KEY;
              console.log(`[CIM] Saving profile to WP for user ${wpUserId}...`);

              const saveRes = await fetch(`${wpBaseUrl}/wp-json/mf/v1/payment-profiles`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${faustSecret}`,
                  'X-FaustWP-Secret': faustSecret || '',
                },
                body: JSON.stringify({
                  userId: wpUserId,
                  customerProfileId: profile.customerProfileId,
                  paymentProfileId: profile.paymentProfileId,
                  last4: newCard?.last4 || '',
                  cardType: newCard?.cardType || '',
                  expDate: newCard?.expDate || '',
                }),
              });

              if (!saveRes.ok) {
                const errBody = await saveRes.text();
                console.error(`[CIM] WP save failed (${saveRes.status}): ${errBody}`);
              } else {
                console.log(`[CIM] Profile saved for user ${wpUserId}: ${profile.customerProfileId}`);
              }
            }
          }
        } catch (err) {
          console.error('[CIM] Profile creation failed (non-blocking):', err);
        }
      })();
    }


  } catch (error) {
    logError('checkout.handler', error, { orderId, orderNumber, transactionId });

    let paymentVoided = false;
    if (transactionId && !orderId) {
      try {
        paymentVoided = await voidPayment(transactionId);
        console.error(
          `[Checkout] Order creation failed after charge. Void of ${transactionId}: ${paymentVoided ? 'reversed' : 'FAILED'}`
        );
      } catch (voidError) {
        console.error('[Checkout] Error while voiding orphaned payment:', voidError);
      }
    }

    await storage.createReconciliationEntry({
      orderId: orderId || 'failed',
      orderNumber,
      transactionId,
      amount: req.body?.amount || '0',
      status: transactionId && !orderId ? 'mismatch' : 'payment_failed',
      eventType: transactionId && !orderId ? 'payment_success' : 'payment_failed',
      metadata: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        hasTransaction: !!transactionId,
        hasOrder: !!orderId,
        orphanedPayment: transactionId && !orderId,
        paymentVoided,
      }),
    });

    const errorResponse = {
      success: false,
      message: error instanceof Error ? error.message : 'Checkout failed',
      code: error instanceof CheckoutError ? error.code : 'CHECKOUT_FAILED',
      orderId,
      orderNumber,
      transactionId,
      paymentVoided,
      requiresSupport: !!transactionId && !orderId && !paymentVoided,
    };

    // Fail idempotency tracking
    if (trackingKey) {
      await failIdempotency(trackingKey, errorResponse);
    }

    const statusCode = error instanceof CheckoutError ? 400 : 500;
    res.status(statusCode).json(errorResponse);
  }
}

// Apply middleware protection (CSRF, rate limit, idempotency check)
export default withPaymentProtection()(checkoutHandler);
