/**
 * Authorize.net Webhook Handler
 *
 * Receives transaction notifications from Authorize.net.
 * Logs events to the reconciliation table for auditing and
 * alerts on mismatches between our records and Authorize.net's.
 *
 * Webhook events: https://developer.authorize.net/api/reference/features/webhooks.html
 *
 * POST /api/webhooks/authorize-net
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { getStorage, IStorage } from '@/lib/storage';
import { logError } from '@/lib/errors';

// ============================================================================
// Types
// ============================================================================

interface AuthorizeNetWebhookPayload {
  notificationId: string;
  eventType: string;
  eventDate: string;
  webhookId: string;
  payload: {
    responseCode?: number;
    authCode?: string;
    avsResponse?: string;
    authAmount?: number;
    entityName: string;
    id: string; // Transaction ID
    invoiceNumber?: string;
    merchantReferenceId?: string; // Our order ID (set via refId in payment)
  };
}

// Authorize.net event types we process
const RELEVANT_EVENTS = [
  'net.authorize.payment.authcapture.created',
  'net.authorize.payment.capture.created',
  'net.authorize.payment.void.created',
  'net.authorize.payment.refund.created',
  'net.authorize.payment.fraud.held',
  'net.authorize.payment.fraud.declined',
];

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify the webhook signature from Authorize.net
 *
 * Authorize.net signs webhooks with HMAC-SHA512 using your signature key.
 * The signature is in the X-ANET-Signature header as "sha512=<signature>"
 */
function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | undefined
): boolean {
  const signatureKey = process.env.AUTHORIZE_SIGNATURE_KEY;

  // In development, allow unsigned webhooks if no key is configured
  if (!signatureKey) {
    console.warn(
      '[Webhook] AUTHORIZE_SIGNATURE_KEY not configured - skipping signature verification'
    );
    return process.env.NODE_ENV !== 'production';
  }

  if (!signatureHeader) {
    console.error('[Webhook] No signature header present');
    return false;
  }

  // Header format: "sha512=<signature>"
  const signatureParts = signatureHeader.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha512') {
    console.error('[Webhook] Invalid signature header format');
    return false;
  }

  const providedSignature = signatureParts[1];

  // Calculate expected signature
  const hmac = crypto.createHmac('sha512', signatureKey);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex').toUpperCase();

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature.toUpperCase()),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle payment captured event
 * Verify our records match Authorize.net's
 */
async function handlePaymentCapture(
  webhook: AuthorizeNetWebhookPayload,
  storage: IStorage
): Promise<void> {
  const orderId = webhook.payload.merchantReferenceId || webhook.payload.invoiceNumber;
  const transactionId = webhook.payload.id;

  console.log(
    `[Webhook] Payment captured: Transaction ${transactionId}, Order ${orderId || 'unknown'}`
  );

  if (!orderId) {
    // Transaction without order reference - log for investigation
    await storage.createReconciliationEntry({
      orderId: 'unknown',
      transactionId,
      amount: webhook.payload.authAmount?.toString() || '0',
      status: 'mismatch',
      eventType: 'webhook_notification',
      metadata: JSON.stringify({
        reason: 'Payment captured without order reference',
        webhookEvent: webhook.eventType,
        notificationId: webhook.notificationId,
      }),
    });
    return;
  }

  // Check if we have a matching reconciliation entry
  const entries = await storage.getReconciliationByTransactionId(transactionId);

  if (entries.length === 0) {
    // Unknown transaction - create mismatch entry
    await storage.createReconciliationEntry({
      orderId,
      transactionId,
      amount: webhook.payload.authAmount?.toString() || '0',
      status: 'mismatch',
      eventType: 'webhook_notification',
      metadata: JSON.stringify({
        reason: 'Transaction not found in our records',
        webhookEvent: webhook.eventType,
        notificationId: webhook.notificationId,
      }),
    });
  } else {
    // Log successful webhook confirmation
    await storage.createReconciliationEntry({
      orderId,
      transactionId,
      amount: webhook.payload.authAmount?.toString() || '0',
      status: 'webhook_received',
      eventType: 'webhook_notification',
      metadata: JSON.stringify({
        webhookEvent: webhook.eventType,
        notificationId: webhook.notificationId,
        confirmed: true,
      }),
    });
  }
}

/**
 * Handle payment void event
 */
async function handlePaymentVoid(
  webhook: AuthorizeNetWebhookPayload,
  storage: IStorage
): Promise<void> {
  const orderId = webhook.payload.merchantReferenceId || webhook.payload.invoiceNumber || 'unknown';
  const transactionId = webhook.payload.id;

  console.log(`[Webhook] Payment voided: Transaction ${transactionId}, Order ${orderId}`);

  await storage.createReconciliationEntry({
    orderId,
    transactionId,
    amount: webhook.payload.authAmount?.toString() || '0',
    status: 'mismatch',
    eventType: 'webhook_notification',
    metadata: JSON.stringify({
      action: 'void',
      requiresOrderUpdate: true,
      webhookEvent: webhook.eventType,
      notificationId: webhook.notificationId,
    }),
  });
}

/**
 * Handle payment refund event
 */
async function handlePaymentRefund(
  webhook: AuthorizeNetWebhookPayload,
  storage: IStorage
): Promise<void> {
  const orderId = webhook.payload.merchantReferenceId || webhook.payload.invoiceNumber || 'unknown';
  const transactionId = webhook.payload.id;

  console.log(`[Webhook] Payment refunded: Transaction ${transactionId}, Order ${orderId}`);

  await storage.createReconciliationEntry({
    orderId,
    transactionId,
    amount: webhook.payload.authAmount?.toString() || '0',
    status: 'mismatch',
    eventType: 'webhook_notification',
    metadata: JSON.stringify({
      action: 'refund',
      requiresOrderUpdate: true,
      webhookEvent: webhook.eventType,
      notificationId: webhook.notificationId,
    }),
  });
}

/**
 * Handle fraud alert events
 */
async function handleFraudAlert(
  webhook: AuthorizeNetWebhookPayload,
  storage: IStorage
): Promise<void> {
  const orderId = webhook.payload.merchantReferenceId || webhook.payload.invoiceNumber || 'unknown';
  const transactionId = webhook.payload.id;

  console.log(
    `[Webhook] Fraud alert: Transaction ${transactionId}, Event ${webhook.eventType}`
  );

  await storage.createReconciliationEntry({
    orderId,
    transactionId,
    amount: webhook.payload.authAmount?.toString() || '0',
    status: 'mismatch',
    eventType: 'webhook_notification',
    metadata: JSON.stringify({
      action: 'fraud_alert',
      webhookEvent: webhook.eventType,
      notificationId: webhook.notificationId,
      requiresReview: true,
      isFraud: webhook.eventType.includes('declined'),
    }),
  });
}

// ============================================================================
// Main Handler
// ============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const storage = await getStorage();

  try {
    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-anet-signature'] as string | undefined;

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('[Webhook] Invalid signature');
      res.status(401).json({ message: 'Invalid signature' });
      return;
    }

    const webhook: AuthorizeNetWebhookPayload = req.body;

    console.log(
      `[Webhook] Received: ${webhook.eventType} (${webhook.notificationId})`
    );

    // Log all webhook receipts for audit
    await storage.createReconciliationEntry({
      orderId: webhook.payload.merchantReferenceId || webhook.payload.invoiceNumber || 'unknown',
      transactionId: webhook.payload.id,
      amount: webhook.payload.authAmount?.toString() || '0',
      status: 'webhook_received',
      eventType: 'webhook_notification',
      metadata: JSON.stringify({
        webhookEventType: webhook.eventType,
        notificationId: webhook.notificationId,
        webhookId: webhook.webhookId,
        eventDate: webhook.eventDate,
      }),
    });

    // Only process relevant events
    if (!RELEVANT_EVENTS.includes(webhook.eventType)) {
      console.log(`[Webhook] Ignoring event type: ${webhook.eventType}`);
      res.status(200).json({ received: true, processed: false });
      return;
    }

    // Process based on event type
    switch (webhook.eventType) {
      case 'net.authorize.payment.authcapture.created':
      case 'net.authorize.payment.capture.created':
        await handlePaymentCapture(webhook, storage);
        break;

      case 'net.authorize.payment.void.created':
        await handlePaymentVoid(webhook, storage);
        break;

      case 'net.authorize.payment.refund.created':
        await handlePaymentRefund(webhook, storage);
        break;

      case 'net.authorize.payment.fraud.held':
      case 'net.authorize.payment.fraud.declined':
        await handleFraudAlert(webhook, storage);
        break;
    }

    res.status(200).json({ received: true, processed: true });

  } catch (error) {
    logError('webhook.authorize-net', error);

    // Return 200 to prevent Authorize.net from retrying
    // Failures are logged for manual investigation
    res.status(200).json({
      received: true,
      processed: false,
      error: 'Processing failed - logged for review',
    });
  }
}

// Configure Next.js to handle the raw body for signature verification
export const config = {
  api: {
    bodyParser: true,
  },
};
