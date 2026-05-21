/**
 * Storage Interface Definitions
 *
 * Abstract storage layer that supports SQLite (development) and Redis (production).
 * All storage operations go through the IStorage interface, making it easy to
 * swap implementations without changing business logic.
 */

export interface StorageConfig {
  type: 'sqlite' | 'redis';
  sqlitePath?: string;
  redisUrl?: string;
  redisPrefix?: string;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitEntry {
  key: string;
  count: number;
  windowStart: number;
  expiresAt: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  keyGenerator?: (identifier: string, endpoint: string) => string;
}

// ============================================================================
// Idempotency Types
// ============================================================================

export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

export interface IdempotencyEntry {
  key: string;
  status: IdempotencyStatus;
  response?: string;
  createdAt: number;
  expiresAt: number;
  orderId?: string;
  transactionId?: string;
}

// ============================================================================
// CSRF Types
// ============================================================================

export interface CsrfTokenEntry {
  token: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

// ============================================================================
// Reconciliation Types
// ============================================================================

export type ReconciliationStatus =
  | 'pending'
  | 'payment_success'
  | 'payment_failed'
  | 'order_updated'
  | 'webhook_received'
  | 'mismatch'
  | 'resolved';

export type ReconciliationEventType =
  | 'checkout_started'
  | 'order_created'
  | 'payment_attempted'
  | 'payment_success'
  | 'payment_failed'
  | 'order_status_updated'
  | 'webhook_notification'
  | 'manual_reconciliation';

export interface ReconciliationEntry {
  id: string;
  orderId: string;
  orderNumber?: string;
  transactionId?: string;
  amount: string;
  status: ReconciliationStatus;
  eventType: ReconciliationEventType;
  metadata?: string;
  createdAt: number;
}

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Abstract storage interface for rate limiting, idempotency, CSRF, and reconciliation.
 * Implementations: SQLiteStorage (dev), RedisStorage (prod)
 */
export interface IStorage {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Rate Limiting
  getRateLimit(key: string): Promise<RateLimitEntry | null>;
  incrementRateLimit(
    key: string,
    windowMs: number,
    maxAttempts: number
  ): Promise<RateLimitEntry>;
  clearRateLimit(key: string): Promise<void>;

  // Idempotency
  getIdempotencyEntry(key: string): Promise<IdempotencyEntry | null>;
  createIdempotencyEntry(
    entry: Omit<IdempotencyEntry, 'createdAt'>
  ): Promise<IdempotencyEntry>;
  updateIdempotencyEntry(
    key: string,
    updates: Partial<IdempotencyEntry>
  ): Promise<void>;

  // CSRF Tokens
  createCsrfToken(sessionId: string, ttlMs?: number): Promise<CsrfTokenEntry>;
  validateCsrfToken(token: string, sessionId: string): Promise<boolean>;
  consumeCsrfToken(token: string): Promise<boolean>;

  // Reconciliation
  createReconciliationEntry(
    entry: Omit<ReconciliationEntry, 'id' | 'createdAt'>
  ): Promise<ReconciliationEntry>;
  updateReconciliationEntry(
    id: string,
    updates: Partial<ReconciliationEntry>
  ): Promise<void>;
  getReconciliationByOrderId(orderId: string): Promise<ReconciliationEntry[]>;
  getReconciliationByTransactionId(
    transactionId: string
  ): Promise<ReconciliationEntry[]>;
  getPendingReconciliations(): Promise<ReconciliationEntry[]>;

  // Cleanup
  cleanupExpiredEntries(): Promise<{
    rateLimits: number;
    idempotency: number;
    csrf: number;
  }>;
}
