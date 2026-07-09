/**
 * Error Types and Utilities
 *
 * Centralized error handling for consistent error messages and logging.
 */

/**
 * Error codes for categorizing errors
 */
export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Cart errors
  CART_EMPTY = 'CART_EMPTY',
  CART_LOAD_FAILED = 'CART_LOAD_FAILED',
  CART_ADD_FAILED = 'CART_ADD_FAILED',
  CART_UPDATE_FAILED = 'CART_UPDATE_FAILED',
  CART_REMOVE_FAILED = 'CART_REMOVE_FAILED',
  CART_CLEAR_FAILED = 'CART_CLEAR_FAILED',

  // Payment errors
  PAYMENT_DECLINED = 'PAYMENT_DECLINED',
  PAYMENT_INVALID_CARD = 'PAYMENT_INVALID_CARD',
  PAYMENT_EXPIRED_CARD = 'PAYMENT_EXPIRED_CARD',
  PAYMENT_PROCESSING_ERROR = 'PAYMENT_PROCESSING_ERROR',
  PAYMENT_DUPLICATE_UNRESOLVED = 'PAYMENT_DUPLICATE_UNRESOLVED',
  PAYMENT_TOKENIZATION_FAILED = 'PAYMENT_TOKENIZATION_FAILED',

  // Order errors
  ORDER_CREATION_FAILED = 'ORDER_CREATION_FAILED',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_UPDATE_FAILED = 'ORDER_UPDATE_FAILED',

  // Auth errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_FAILED = 'AUTH_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Rate Limiting errors
  RATE_LIMITED = 'RATE_LIMITED',

  // Idempotency errors
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  IDEMPOTENCY_KEY_REQUIRED = 'IDEMPOTENCY_KEY_REQUIRED',

  // CSRF errors
  CSRF_INVALID = 'CSRF_INVALID',
  CSRF_MISSING = 'CSRF_MISSING',

  // Checkout errors
  CHECKOUT_FAILED = 'CHECKOUT_FAILED',
  CHECKOUT_CART_CHANGED = 'CHECKOUT_CART_CHANGED',
  ORDER_PENDING_PAYMENT = 'ORDER_PENDING_PAYMENT',
  PAYMENT_ORDER_MISMATCH = 'PAYMENT_ORDER_MISMATCH',

  // Webhook errors
  WEBHOOK_INVALID_SIGNATURE = 'WEBHOOK_INVALID_SIGNATURE',
  WEBHOOK_PROCESSING_FAILED = 'WEBHOOK_PROCESSING_FAILED',

  // Generic
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Base application error class
 */
export class AppError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;

  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Cart-specific error
 */
export class CartError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.UNKNOWN_ERROR, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'CartError';
  }
}

/**
 * Payment-specific error
 */
export class PaymentError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.PAYMENT_PROCESSING_ERROR, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'PaymentError';
  }
}

/**
 * Order-specific error
 */
export class OrderError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.ORDER_CREATION_FAILED, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'OrderError';
  }
}

/**
 * Checkout-specific error with order and transaction context
 */
export class CheckoutError extends AppError {
  orderId?: string;
  transactionId?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CHECKOUT_FAILED,
    details?: { orderId?: string; transactionId?: string } & Record<string, unknown>
  ) {
    super(message, code, details);
    this.name = 'CheckoutError';
    this.orderId = details?.orderId;
    this.transactionId = details?.transactionId;
  }
}

/**
 * User-friendly error messages for each error code
 */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: 'Unable to connect. Please check your internet connection.',
  [ErrorCode.TIMEOUT]: 'The request timed out. Please try again.',

  [ErrorCode.CART_EMPTY]: 'Your cart is empty.',
  [ErrorCode.CART_LOAD_FAILED]: 'Failed to load your cart. Please refresh the page.',
  [ErrorCode.CART_ADD_FAILED]: 'Failed to add item to cart. Please try again.',
  [ErrorCode.CART_UPDATE_FAILED]: 'Failed to update cart. Please try again.',
  [ErrorCode.CART_REMOVE_FAILED]: 'Failed to remove item from cart. Please try again.',
  [ErrorCode.CART_CLEAR_FAILED]: 'Failed to clear cart.',

  [ErrorCode.PAYMENT_DECLINED]: 'Your payment was declined. Please try a different payment method.',
  [ErrorCode.PAYMENT_INVALID_CARD]: 'Invalid card information. Please check your card details.',
  [ErrorCode.PAYMENT_EXPIRED_CARD]: 'Your card has expired. Please use a different card.',
  [ErrorCode.PAYMENT_PROCESSING_ERROR]: 'Payment processing failed. Please try again.',
  [ErrorCode.PAYMENT_DUPLICATE_UNRESOLVED]: 'A duplicate payment was detected but the original could not be confirmed. Please do not retry and contact support.',
  [ErrorCode.PAYMENT_TOKENIZATION_FAILED]: 'Unable to process card. Please try again.',

  [ErrorCode.ORDER_CREATION_FAILED]: 'Failed to create your order. Please try again.',
  [ErrorCode.ORDER_NOT_FOUND]: 'Order not found.',
  [ErrorCode.ORDER_UPDATE_FAILED]: 'Failed to update your order. Please contact support.',

  [ErrorCode.AUTH_REQUIRED]: 'Please sign in to continue.',
  [ErrorCode.AUTH_FAILED]: 'Authentication failed. Please try again.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',

  [ErrorCode.VALIDATION_ERROR]: 'Please check your information and try again.',

  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',

  [ErrorCode.IDEMPOTENCY_CONFLICT]: 'This request is already being processed. Please wait.',
  [ErrorCode.IDEMPOTENCY_KEY_REQUIRED]: 'A unique request identifier is required.',

  [ErrorCode.CSRF_INVALID]: 'Security token is invalid. Please refresh the page and try again.',
  [ErrorCode.CSRF_MISSING]: 'Security token is missing. Please refresh the page.',

  [ErrorCode.CHECKOUT_FAILED]: 'Checkout failed. Please try again.',
  [ErrorCode.CHECKOUT_CART_CHANGED]: 'Your cart has changed. Please review and try again.',
  [ErrorCode.ORDER_PENDING_PAYMENT]: 'Your order is awaiting payment confirmation.',
  [ErrorCode.PAYMENT_ORDER_MISMATCH]: 'Payment does not match order. Please contact support.',

  [ErrorCode.WEBHOOK_INVALID_SIGNATURE]: 'Invalid webhook signature.',
  [ErrorCode.WEBHOOK_PROCESSING_FAILED]: 'Webhook processing failed.',

  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

/**
 * Get a user-friendly error message
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    return ERROR_MESSAGES[error.code] || error.message;
  }

  if (error instanceof Error) {
    // Try to extract meaningful info from the error message
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return ERROR_MESSAGES[ErrorCode.NETWORK_ERROR];
    }
    if (message.includes('timeout')) {
      return ERROR_MESSAGES[ErrorCode.TIMEOUT];
    }
    if (message.includes('declined')) {
      return ERROR_MESSAGES[ErrorCode.PAYMENT_DECLINED];
    }

    return error.message;
  }

  return ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}

/**
 * Get the error code from an error
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) {
    return error.code;
  }
  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Log an error with context
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>
): void {
  const errorInfo = {
    context,
    timestamp: new Date().toISOString(),
    ...(error instanceof AppError && {
      code: error.code,
      details: error.details,
    }),
    ...(error instanceof Error && {
      message: error.message,
      stack: error.stack,
    }),
    ...additionalInfo,
  };

  console.error(`[${context}]`, errorInfo);
}

/**
 * Check if an error is a specific type
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof AppError && error.code === code;
}

/**
 * Check if error is recoverable (user can retry)
 */
export function isRecoverable(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true; // Assume recoverable for unknown errors
  }

  const nonRecoverableCodes = [
    ErrorCode.PAYMENT_EXPIRED_CARD,
    ErrorCode.AUTH_FAILED,
  ];

  return !nonRecoverableCodes.includes(error.code);
}
