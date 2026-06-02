import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Secure Payment Processing API Route
 *
 * This endpoint receives tokenized payment data from the frontend
 * and processes it through Authorize.net's server-to-server API.
 *
 * Security measures:
 * - Only accepts POST requests
 * - Validates required fields
 * - Uses environment variables for credentials (never exposed to client)
 * - Processes tokenized data only (raw card numbers never reach here)
 * - Implements rate limiting considerations
 * - Returns minimal error information to prevent information leakage
 */

interface PaymentRequest {
  paymentNonce: {
    dataDescriptor: string;
    dataValue: string;
  };
  amount: string;
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
    productId: number;
    name: string;
    quantity: number;
    price: string;
  }>;
}

interface AuthorizeNetResponse {
  transactionResponse?: {
    transId: string;
    responseCode: string;
    authCode: string;
    messages?: Array<{
      code: string;
      description: string;
    }>;
    errors?: Array<{
      errorCode: string;
      errorText: string;
    }>;
  };
  messages: {
    resultCode: 'Ok' | 'Error';
    message: Array<{
      code: string;
      text: string;
    }>;
  };
}

import { withMiddleware, withPaymentRateLimit, withIdempotency } from '@/lib/middleware';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const apiLoginId = process.env.NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY;
  const environment = process.env.NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT || 'sandbox';

  if (!apiLoginId || !transactionKey) {
    console.error('Authorize.net credentials not configured');
    return res.status(500).json({ message: 'Payment service not configured' });
  }

  try {
    const body: PaymentRequest = req.body;

    // Validate required fields
    if (!body.paymentNonce?.dataDescriptor || !body.paymentNonce?.dataValue) {
      return res.status(400).json({ message: 'Invalid payment data' });
    }

    if (!body.amount || !body.billing) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Parse amount (remove $ and convert to number)
    const amount = parseFloat(body.amount.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Build line items for Authorize.net
    const lineItems = body.items?.slice(0, 30).map((item, index) => ({
      itemId: (index + 1).toString(),
      name: item.name.substring(0, 31),
      description: item.name.substring(0, 255),
      quantity: item.quantity.toString(),
      unitPrice: parseFloat(item.price.replace(/[^0-9.]/g, '')).toFixed(2),
    }));

    // Authorize.net API request payload
    const payload = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: apiLoginId,
          transactionKey: transactionKey,
        },
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
            invoiceNumber: `INV-${Date.now()}`,
            description: 'Online Store Purchase',
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

    // Determine API endpoint based on environment
    const apiUrl =
      environment === 'production'
        ? 'https://api.authorize.net/xml/v1/request.api'
        : 'https://apitest.authorize.net/xml/v1/request.api';

    // Make request to Authorize.net
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result: AuthorizeNetResponse = await response.json();

    // Handle Authorize.net response
    if (result.messages.resultCode === 'Ok' && result.transactionResponse) {
      const transResponse = result.transactionResponse;

      // Check for successful transaction (responseCode 1 = Approved)
      if (transResponse.responseCode === '1') {
        return res.status(200).json({
          success: true,
          transactionId: transResponse.transId,
          authCode: transResponse.authCode,
        });
      }

      // Transaction was not approved
      const errorMessage =
        transResponse.errors?.[0]?.errorText ||
        transResponse.messages?.[0]?.description ||
        'Transaction was declined';

      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    // API-level error
    const errorMessage =
      result.messages.message?.[0]?.text || 'Payment processing failed';
    return res.status(400).json({
      success: false,
      message: errorMessage,
    });
  } catch (error) {
    console.error('Payment processing error');

    // Don't expose internal errors to client
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your payment. Please try again.',
    });
  }
}

export default withMiddleware(
  withPaymentRateLimit(),
  withIdempotency({ required: true })
)(handler);
