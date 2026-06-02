import type { NextApiRequest, NextApiResponse } from 'next';
import {
  makeHttpRequest,
  makeHttpGetRequest,
  extractWcSessionToken,
  getWordPressGraphQLUrl,
} from '@/lib/http';
import { withMiddleware, withPaymentRateLimit, withIdempotency } from '@/lib/middleware';

/**
 * Order Creation API Route
 *
 * Creates an order in WooCommerce after successful payment.
 * Uses the WooGraphQL checkout mutation.
 */

interface OrderRequest {
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
  items: Array<{
    key: string;
    quantity: number;
    product: {
      databaseId: number;
    };
    variation?: {
      databaseId: number;
    };
  }>;
  paymentMethod: string;
  paymentToken?: {
    dataDescriptor: string;
    dataValue: string;
  };
  transactionId?: string;
  customerId?: number;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const fullUrl = getWordPressGraphQLUrl();

  if (!fullUrl) {
    return res.status(500).json({ message: 'WordPress URL not configured' });
  }

  try {
    const body: OrderRequest = req.body;

    // Validate required fields
    if (!body.billing || !body.items || body.items.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!body.paymentToken && !body.transactionId) {
      return res.status(400).json({ message: 'Payment token or transaction ID required' });
    }

    const authorizeNetPaymentMethod = process.env.AUTHORIZE_NET_PAYMENT_METHOD || 'authorize_net_cim';

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
            paymentMethod
          }
          customer {
            id
          }
        }
      }
    `;

    // Build meta data for payment info
    const metaData: Array<{ key: string; value: string }> = [];

    if (body.paymentToken) {
      metaData.push(
        { key: '_authorize_net_data_descriptor', value: body.paymentToken.dataDescriptor },
        { key: '_authorize_net_data_value', value: body.paymentToken.dataValue }
      );
    }

    if (body.transactionId) {
      metaData.push(
        { key: '_transaction_id', value: body.transactionId },
        { key: '_authorize_net_transaction_id', value: body.transactionId },
        { key: '_payment_method_title', value: 'Credit Card (Authorize.net)' }
      );
    }

    const paymentMethod = body.paymentToken ? authorizeNetPaymentMethod : 'bacs';

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
        paymentMethod,
        metaData: metaData.length > 0 ? metaData : undefined,
        isPaid: body.transactionId ? true : undefined,
        transactionId: body.transactionId || undefined,
      },
    };

    const cookies = req.headers.cookie || '';
    const wcSessionToken = extractWcSessionToken(cookies);

    // Try to get auth token for authenticated users
    let authToken: string | undefined;
    const wpHost = new URL(wordpressUrl).host.replace(/[^a-zA-Z0-9.-]/g, '');
    const rtCookiePattern = new RegExp(`https?${wpHost}-rt=([^;]+)`);
    const rtMatch = cookies.match(rtCookiePattern);

    if (rtMatch) {
      try {
        const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
        const host = req.headers.host || 'localhost:3001';
        const tokenUrl = `${protocol}://${host}/api/faust/auth/token`;

        const tokenResponse = await makeHttpGetRequest(tokenUrl, cookies);

        if (tokenResponse.data?.accessToken) {
          authToken = tokenResponse.data.accessToken;
        }
      } catch (err) {
        // Continue as guest checkout if token fetch fails
      }
    }

    const response = await makeHttpRequest({
      url: fullUrl,
      body: JSON.stringify({ query: mutation, variables }),
      cookies,
      wcSessionToken: wcSessionToken || undefined,
      authToken,
    });

    const result = response.data;

    if (result.errors) {
      return res.status(400).json({
        success: false,
        message: result.errors[0]?.message || 'Failed to create order',
      });
    }

    if (result.data?.checkout?.order) {
      return res.status(200).json({
        success: true,
        orderId: result.data.checkout.order.orderNumber || result.data.checkout.order.databaseId,
        orderDatabaseId: result.data.checkout.order.databaseId,
      });
    }

    if (result.data?.checkout?.result === 'success') {
      return res.status(200).json({
        success: true,
        orderId: 'pending',
        message: 'Order placed successfully',
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Order creation failed - no order returned',
    });
  } catch (error) {
    console.error('Order creation failed');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating your order.',
    });
  }
}

export default withMiddleware(
  withPaymentRateLimit(),
  withIdempotency({ required: true })
)(handler);
