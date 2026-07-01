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
  makeHttpGetRequest,
  extractWcSessionToken,
  getWordPressGraphQLUrl,
} from '@/lib/http';
import { CheckoutError, ErrorCode, logError } from '@/lib/errors';
import {
  createProfileFromTransaction,
  chargeProfile,
  getSavedCards,
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
  amount: string;
  coupons?: string[];
  items: Array<{
    productId: number;
    name: string;
    quantity: number;
    price: string;
  }>;
}

interface PendingOrder {
  id: string;
  databaseId: number;
  orderNumber: string;
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
 * Get auth token for authenticated users from Faust.js
 */
async function getAuthTokenFromRequest(req: NextApiRequest): Promise<string | undefined> {
  const cookies = req.headers.cookie || '';
  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

  // Look for Faust.js refresh token cookie
  const wpHost = new URL(wordpressUrl).host.replace(/[^a-zA-Z0-9.-]/g, '');
  const rtCookiePattern = new RegExp(`https?${wpHost}-rt=([^;]+)`);
  const rtMatch = cookies.match(rtCookiePattern);

  if (!rtMatch) {
    console.log('[Checkout] No Faust.js refresh token found - guest checkout');
    return undefined;
  }

  console.log('[Checkout] Faust.js refresh token found, getting access token...');

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost:3001';
    const tokenUrl = `${protocol}://${host}/api/faust/auth/token`;

    const tokenResponse = await makeHttpGetRequest(tokenUrl, cookies);

    if (tokenResponse.data?.accessToken) {
      console.log('[Checkout] Successfully obtained access token for authenticated checkout');
      return tokenResponse.data.accessToken;
    } else {
      console.log('[Checkout] Could not get access token from token endpoint');
      return undefined;
    }
  } catch (err) {
    console.log('[Checkout] Failed to get access token:', err);
    return undefined;
  }
}

function parseMoney(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return NaN;
  return parseFloat(String(value).replace(/[^0-9.]/g, ''));
}

async function applyCouponsToSession(
  req: NextApiRequest,
  codes: string[],
  authToken?: string
): Promise<void> {
  if (!codes || codes.length === 0) return;

  const graphqlUrl = getWordPressGraphQLUrl();
  const cookies = req.headers.cookie || '';
  const wcSessionToken = extractWcSessionToken(cookies);

  const mutation = `
    mutation ApplyCoupon($code: String!) {
      applyCoupon(input: { code: $code }) {
        cart { total discountTotal }
      }
    }
  `;

  for (const code of codes) {
    if (!code) continue;
    try {
      const response = await makeHttpRequest({
        url: graphqlUrl,
        body: JSON.stringify({ query: mutation, variables: { code } }),
        cookies,
        wcSessionToken: wcSessionToken || undefined,
        authToken,
      });

      if (response.data?.errors) {
        const msg = response.data.errors[0]?.message || 'unknown error';
        console.log(`[Checkout] applyCoupon "${code}": ${msg}`);
      } else {
        console.log(`[Checkout] Coupon "${code}" ensured on server session`);
      }
    } catch (err) {
      console.error(`[Checkout] Failed to apply coupon "${code}":`, err);
    }
  }
}

async function getServerCartTotal(
  req: NextApiRequest,
  authToken?: string
): Promise<{ total: number; discountTotal: number } | null> {
  const graphqlUrl = getWordPressGraphQLUrl();
  const cookies = req.headers.cookie || '';
  const wcSessionToken = extractWcSessionToken(cookies);

  const query = `
    query CartTotals {
      cart {
        total
        subtotal
        discountTotal
        isEmpty
      }
    }
  `;

  try {
    const response = await makeHttpRequest({
      url: graphqlUrl,
      body: JSON.stringify({ query }),
      cookies,
      wcSessionToken: wcSessionToken || undefined,
      authToken,
    });

    const cart = response.data?.data?.cart;
    if (!cart || cart.isEmpty) {
      console.warn('[Checkout] Server cart empty or unavailable when reading total');
      return null;
    }

    const total = parseMoney(cart.total);
    if (isNaN(total)) return null;

    const discountTotal = parseMoney(cart.discountTotal);
    return { total, discountTotal: isNaN(discountTotal) ? 0 : discountTotal };
  } catch (err) {
    console.error('[Checkout] Failed to read server cart total:', err);
    return null;
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

/**
 * Fallback: Create order directly without cart session
 * Used when the session-based checkout fails (e.g., session expired)
 */
async function createOrderDirectly(
  body: CheckoutRequest,
  transactionId: string,
  cookies?: string,
  wcSessionToken?: string,
  authToken?: string
): Promise<PendingOrder> {
  const graphqlUrl = getWordPressGraphQLUrl();

  console.log('[Checkout] Attempting direct order creation (fallback)...');

  const mutation = `
    mutation CreateOrder($input: CreateOrderInput!) {
      createOrder(input: $input) {
        orderId
        order {
          id
          databaseId
          orderNumber
          status
          total
        }
      }
    }
  `;

  // Convert items to line items format
  const lineItems = body.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));

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
        firstName: body.shipping?.firstName || body.billing.firstName,
        lastName: body.shipping?.lastName || body.billing.lastName,
        address1: body.shipping?.address1 || body.billing.address1,
        address2: body.shipping?.address2 || body.billing.address2 || '',
        city: body.shipping?.city || body.billing.city,
        state: body.shipping?.state || body.billing.state,
        postcode: body.shipping?.postcode || body.billing.postcode,
        country: body.shipping?.country || body.billing.country,
      },
      paymentMethod: 'authorize_net',
      isPaid: true,
      transactionId: transactionId,
      lineItems,
      metaData: [
        { key: '_transaction_id', value: transactionId },
        { key: '_authorize_net_transaction_id', value: transactionId },
        { key: '_payment_method', value: 'authnet' },
        { key: '_payment_method_title', value: 'Credit Card (Authorize.net)' },
      ],
    },
  };

  const response = await makeHttpRequest({
    url: graphqlUrl,
    body: JSON.stringify({ query: mutation, variables }),
    cookies,
    wcSessionToken,
    authToken,
  });

  console.log('[Checkout] Direct order response:', JSON.stringify(response.data, null, 2).substring(0, 1000));

  if (response.data?.errors) {
    console.error('[Checkout] Direct order GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
    throw new CheckoutError(
      response.data.errors[0]?.message || 'Failed to create order directly',
      ErrorCode.ORDER_CREATION_FAILED,
      { graphqlErrors: response.data.errors, transactionId }
    );
  }

  const order = response.data?.data?.createOrder?.order;
  if (!order) {
    throw new CheckoutError(
      'No order returned from direct creation',
      ErrorCode.ORDER_CREATION_FAILED,
      { transactionId }
    );
  }

  console.log(`[Checkout] Direct order created: ${order.orderNumber} (ID: ${order.databaseId})`);

  return {
    id: order.id,
    databaseId: order.databaseId,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
  };
}

/**
 * Create order in WooCommerce via GraphQL with payment already processed
 * This creates the order with isPaid=true and transactionId set
 */
async function createOrderWithPayment(
  req: NextApiRequest,
  body: CheckoutRequest,
  transactionId: string,
  authToken?: string
): Promise<PendingOrder> {
  const graphqlUrl = getWordPressGraphQLUrl();
  const cookies = req.headers.cookie || '';
  const wcSessionToken = extractWcSessionToken(cookies);

  console.log('[Checkout] Session info:', {
    hasWcSessionToken: !!wcSessionToken,
    wcSessionTokenPreview: wcSessionToken ? wcSessionToken.substring(0, 30) + '...' : 'none',
    hasAuthToken: !!authToken,
    cookieCount: cookies.split(';').length,
    cookieNames: cookies.split(';').map(c => c.trim().split('=')[0]),
  });

  // Warn if no session for guest checkout
  if (!wcSessionToken && !authToken) {
    console.error('[Checkout] WARNING: No WC session token and no auth token - guest cart may not be found!');
  }

  // Use the checkout mutation which processes the cart
  const mutation = `
    mutation Checkout($input: CheckoutInput!) {
      checkout(input: $input) {
        result
        order {
          id
          databaseId
          orderNumber
          status
          total
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
        firstName: body.shipping?.firstName || body.billing.firstName,
        lastName: body.shipping?.lastName || body.billing.lastName,
        address1: body.shipping?.address1 || body.billing.address1,
        address2: body.shipping?.address2 || body.billing.address2 || '',
        city: body.shipping?.city || body.billing.city,
        state: body.shipping?.state || body.billing.state,
        postcode: body.shipping?.postcode || body.billing.postcode,
        country: body.shipping?.country || body.billing.country,
      },
      paymentMethod: 'authorize_net',
      isPaid: true,
      transactionId: transactionId,
      metaData: [
        { key: '_transaction_id', value: transactionId },
        { key: '_authorize_net_transaction_id', value: transactionId },
        { key: '_payment_method', value: 'authnet' },
        { key: '_payment_method_title', value: 'Credit Card (Authorize.net)' },
      ],
    },
  };

  console.log('[Checkout] Creating order with payment...', authToken ? '(authenticated)' : '(guest)');

  const response = await makeHttpRequest({
    url: graphqlUrl,
    body: JSON.stringify({ query: mutation, variables }),
    cookies,
    wcSessionToken: wcSessionToken || undefined,
    authToken,
  });

  // Log full response for debugging
  console.log('[Checkout] GraphQL response status:', response.status);
  console.log('[Checkout] GraphQL response data:', JSON.stringify(response.data, null, 2).substring(0, 1000));

  if (response.data?.errors) {
    console.error('[Checkout] GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
    throw new CheckoutError(
      response.data.errors[0]?.message || 'Failed to create order',
      ErrorCode.ORDER_CREATION_FAILED,
      { graphqlErrors: response.data.errors, transactionId }
    );
  }

  const order = response.data?.data?.checkout?.order;
  if (!order) {
    console.error('[Checkout] No order in response. Full data:', JSON.stringify(response.data, null, 2));
    throw new CheckoutError(
      'No order returned from checkout',
      ErrorCode.ORDER_CREATION_FAILED,
      { transactionId, checkoutResult: response.data?.data?.checkout?.result }
    );
  }

  console.log(`[Checkout] Order created: ${order.orderNumber} (ID: ${order.databaseId}) with transaction ${transactionId}`);

  return {
    id: order.id,
    databaseId: order.databaseId,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
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
    const refId = (idempotencyKey || `cim_${Date.now()}`).substring(0, 20);
    const result = await chargeProfile(
      body.savedCard.customerProfileId,
      body.savedCard.paymentProfileId,
      amount.toFixed(2),
      refId
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

  // Use idempotency key as refId to help with duplicate detection
  const refId = idempotencyKey || `checkout_${Date.now()}`;

  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: apiLoginId,
        transactionKey: transactionKey,
      },
      refId: refId.substring(0, 20), // Authorize.net limits refId to 20 chars
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
          invoiceNumber: refId.substring(0, 20),
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
  if (
    result.messages?.resultCode !== 'Ok' ||
    result.transactionResponse?.responseCode !== '1'
  ) {
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

    // Get auth token for authenticated users
    const authToken = await getAuthTokenFromRequest(req);

    await storage.createReconciliationEntry({
      orderId: 'pending',
      amount: body.amount,
      status: 'pending',
      eventType: 'checkout_started',
      metadata: JSON.stringify({ email: body.billing.email, isAuthenticated: !!authToken }),
    });

    await applyCouponsToSession(req, body.coupons || [], authToken);

    const serverCart = await getServerCartTotal(req, authToken);
    const browserAmount = parseMoney(body.amount);
    const chargeAmount = serverCart ? serverCart.total : browserAmount;

    if (isNaN(chargeAmount) || chargeAmount <= 0) {
      throw new CheckoutError(
        'Could not determine a valid amount to charge',
        ErrorCode.VALIDATION_ERROR
      );
    }

    console.log(
      `[Checkout] Charge amount resolved to ${chargeAmount.toFixed(2)} ` +
        `(source: ${serverCart ? 'server cart' : 'browser fallback'}, browser said ${browserAmount})`
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
    try {
      order = await createOrderWithPayment(req, body, transactionId, authToken);
    } catch (checkoutError) {
      // If session-based checkout fails, try direct order creation as fallback
      console.log('[Checkout] Session-based checkout failed, trying direct order creation...');
      console.log('[Checkout] Original error:', checkoutError instanceof Error ? checkoutError.message : checkoutError);

      try {
        const fallbackCookies = req.headers.cookie || '';
        const fallbackSession = extractWcSessionToken(fallbackCookies) || undefined;
        order = await createOrderDirectly(body, transactionId, fallbackCookies, fallbackSession, authToken);
        console.log('[Checkout] Direct order creation succeeded!');
      } catch (directError) {
        // Both methods failed - throw the original error
        console.error('[Checkout] Both checkout methods failed!');
        throw checkoutError;
      }
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

    // STEP 3: Save customer addresses for authenticated users
    if (authToken) {
      await updateCustomerAddresses(req, body, authToken);
    }

    // STEP 4: Create CIM profile for authenticated users who opted to save their card.
    // Non-blocking — checkout succeeds even if CIM fails.
    if (authToken && body.saveCard && !body.savedCard && transactionId) {
      (async () => {
        try {
          // Get WordPress user ID from the viewer query
          const wpUrl = getWordPressGraphQLUrl();
          const viewerRes = await makeHttpRequest({
            url: wpUrl,
            body: JSON.stringify({ query: '{ viewer { databaseId } }' }),
            authToken,
          });
          const wpUserId = viewerRes.data?.data?.viewer?.databaseId;
          console.log(`[CIM] Viewer query result: userId=${wpUserId}, status=${viewerRes.status}`);

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

    // Success response
    const successResponse = {
      success: true,
      orderId: orderNumber || orderId,
      orderDatabaseId: order.databaseId,
      transactionId,
    };

    // Complete idempotency tracking
    if (trackingKey) {
      await completeIdempotency(trackingKey, successResponse, orderId, transactionId);
    }

    console.log(`[Checkout] Checkout complete: Order ${orderNumber}, Transaction ${transactionId}`);
    res.status(200).json(successResponse);

  } catch (error) {
    logError('checkout.handler', error, { orderId, orderNumber, transactionId });

    // Log failure to reconciliation
    // If we have a transactionId but no orderId, payment succeeded but order creation failed
    // This is a critical situation that needs manual attention
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
      }),
    });

    const errorResponse = {
      success: false,
      message: error instanceof Error ? error.message : 'Checkout failed',
      code: error instanceof CheckoutError ? error.code : 'CHECKOUT_FAILED',
      orderId,
      orderNumber,
      transactionId,
      // If payment succeeded but order creation failed, tell user to contact support
      requiresSupport: !!transactionId && !orderId,
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
