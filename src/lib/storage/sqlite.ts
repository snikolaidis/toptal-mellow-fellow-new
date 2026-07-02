/**
 * SQLite Storage Implementation
 *
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 * Suitable for single-server deployments during development.
 * Can be swapped for Redis in production for distributed deployments.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  IStorage,
  RateLimitEntry,
  IdempotencyEntry,
  CsrfTokenEntry,
  ReconciliationEntry,
} from './types';

const SCHEMA = `
  -- Rate Limiting Table
  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    window_start INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);

  -- Idempotency Keys Table
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'failed')),
    response TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    order_id TEXT,
    transaction_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
  CREATE INDEX IF NOT EXISTS idx_idempotency_order ON idempotency_keys(order_id);

  -- CSRF Tokens Table
  CREATE TABLE IF NOT EXISTS csrf_tokens (
    token TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_csrf_session ON csrf_tokens(session_id);
  CREATE INDEX IF NOT EXISTS idx_csrf_expires ON csrf_tokens(expires_at);

  -- Reconciliation Log Table
  CREATE TABLE IF NOT EXISTS reconciliation_log (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    order_number TEXT,
    transaction_id TEXT,
    amount TEXT NOT NULL,
    status TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reconciliation_order ON reconciliation_log(order_id);
  CREATE INDEX IF NOT EXISTS idx_reconciliation_transaction ON reconciliation_log(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON reconciliation_log(status);
  CREATE INDEX IF NOT EXISTS idx_reconciliation_created ON reconciliation_log(created_at);
`;

export class SQLiteStorage implements IStorage {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = './data/payment.db') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Execute schema (split by semicolons and filter empty statements)
    const statements = SCHEMA.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      this.db.exec(statement);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  async getRateLimit(key: string): Promise<RateLimitEntry | null> {
    const db = this.getDb();
    const now = Date.now();

    const row = db
      .prepare(
        `SELECT key, count, window_start, expires_at
         FROM rate_limits
         WHERE key = ? AND expires_at > ?`
      )
      .get(key, now) as
      | { key: string; count: number; window_start: number; expires_at: number }
      | undefined;

    if (!row) return null;

    return {
      key: row.key,
      count: row.count,
      windowStart: row.window_start,
      expiresAt: row.expires_at,
    };
  }

  async incrementRateLimit(
    key: string,
    windowMs: number,
    maxAttempts: number
  ): Promise<RateLimitEntry> {
    const db = this.getDb();
    const now = Date.now();
    const expiresAt = now + windowMs;

    // Try to update existing entry
    const existing = await this.getRateLimit(key);

    if (existing) {
      // Increment existing entry
      db.prepare(
        `UPDATE rate_limits SET count = count + 1 WHERE key = ?`
      ).run(key);

      return {
        key,
        count: existing.count + 1,
        windowStart: existing.windowStart,
        expiresAt: existing.expiresAt,
      };
    }

    // Create new entry
    db.prepare(
      `INSERT OR REPLACE INTO rate_limits (key, count, window_start, expires_at)
       VALUES (?, 1, ?, ?)`
    ).run(key, now, expiresAt);

    return {
      key,
      count: 1,
      windowStart: now,
      expiresAt,
    };
  }

  async clearRateLimit(key: string): Promise<void> {
    const db = this.getDb();
    db.prepare(`DELETE FROM rate_limits WHERE key = ?`).run(key);
  }

  // ============================================================================
  // Idempotency
  // ============================================================================

  async getIdempotencyEntry(key: string): Promise<IdempotencyEntry | null> {
    const db = this.getDb();
    const now = Date.now();

    const row = db
      .prepare(
        `SELECT key, status, response, created_at, expires_at, order_id, transaction_id
         FROM idempotency_keys
         WHERE key = ? AND expires_at > ?`
      )
      .get(key, now) as
      | {
          key: string;
          status: string;
          response: string | null;
          created_at: number;
          expires_at: number;
          order_id: string | null;
          transaction_id: string | null;
        }
      | undefined;

    if (!row) return null;

    return {
      key: row.key,
      status: row.status as IdempotencyEntry['status'],
      response: row.response || undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      orderId: row.order_id || undefined,
      transactionId: row.transaction_id || undefined,
    };
  }

  async createIdempotencyEntry(
    entry: Omit<IdempotencyEntry, 'createdAt'>
  ): Promise<IdempotencyEntry> {
    const db = this.getDb();
    const createdAt = Date.now();

    db.prepare(
      `INSERT INTO idempotency_keys (key, status, response, created_at, expires_at, order_id, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.key,
      entry.status,
      entry.response || null,
      createdAt,
      entry.expiresAt,
      entry.orderId || null,
      entry.transactionId || null
    );

    return {
      ...entry,
      createdAt,
    };
  }

  async updateIdempotencyEntry(
    key: string,
    updates: Partial<IdempotencyEntry>
  ): Promise<void> {
    const db = this.getDb();
    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.response !== undefined) {
      setClauses.push('response = ?');
      values.push(updates.response);
    }
    if (updates.orderId !== undefined) {
      setClauses.push('order_id = ?');
      values.push(updates.orderId);
    }
    if (updates.transactionId !== undefined) {
      setClauses.push('transaction_id = ?');
      values.push(updates.transactionId);
    }

    if (setClauses.length === 0) return;

    values.push(key);
    db.prepare(
      `UPDATE idempotency_keys SET ${setClauses.join(', ')} WHERE key = ?`
    ).run(...values);
  }

  // ============================================================================
  // CSRF Tokens
  // ============================================================================

  async createCsrfToken(
    sessionId: string,
    ttlMs: number = 3600000
  ): Promise<CsrfTokenEntry> {
    const db = this.getDb();
    const token = crypto.randomBytes(32).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + ttlMs;

    db.prepare(
      `INSERT INTO csrf_tokens (token, session_id, created_at, expires_at, used)
       VALUES (?, ?, ?, ?, 0)`
    ).run(token, sessionId, createdAt, expiresAt);

    return {
      token,
      sessionId,
      createdAt,
      expiresAt,
      used: false,
    };
  }

  async validateCsrfToken(token: string, sessionId: string): Promise<boolean> {
    const db = this.getDb();
    const now = Date.now();

    const row = db
      .prepare(
        `SELECT token FROM csrf_tokens
         WHERE token = ? AND session_id = ? AND expires_at > ? AND used = 0`
      )
      .get(token, sessionId, now);

    return !!row;
  }

  async consumeCsrfToken(token: string): Promise<boolean> {
    const db = this.getDb();
    const result = db
      .prepare(`UPDATE csrf_tokens SET used = 1 WHERE token = ? AND used = 0`)
      .run(token);

    return result.changes > 0;
  }

  // ============================================================================
  // Reconciliation
  // ============================================================================

  async createReconciliationEntry(
    entry: Omit<ReconciliationEntry, 'id' | 'createdAt'>
  ): Promise<ReconciliationEntry> {
    const db = this.getDb();
    const id = uuidv4();
    const createdAt = Date.now();

    db.prepare(
      `INSERT INTO reconciliation_log
       (id, order_id, order_number, transaction_id, amount, status, event_type, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      entry.orderId,
      entry.orderNumber || null,
      entry.transactionId || null,
      entry.amount,
      entry.status,
      entry.eventType,
      entry.metadata || null,
      createdAt
    );

    return {
      id,
      ...entry,
      createdAt,
    };
  }

  async updateReconciliationEntry(
    id: string,
    updates: Partial<ReconciliationEntry>
  ): Promise<void> {
    const db = this.getDb();
    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.orderId !== undefined) {
      setClauses.push('order_id = ?');
      values.push(updates.orderId);
    }
    if (updates.orderNumber !== undefined) {
      setClauses.push('order_number = ?');
      values.push(updates.orderNumber);
    }
    if (updates.transactionId !== undefined) {
      setClauses.push('transaction_id = ?');
      values.push(updates.transactionId);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(updates.metadata);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    db.prepare(
      `UPDATE reconciliation_log SET ${setClauses.join(', ')} WHERE id = ?`
    ).run(...values);
  }

  async getReconciliationByOrderId(
    orderId: string
  ): Promise<ReconciliationEntry[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT id, order_id, order_number, transaction_id, amount, status, event_type, metadata, created_at
         FROM reconciliation_log
         WHERE order_id = ?
         ORDER BY created_at DESC`
      )
      .all(orderId) as Array<{
      id: string;
      order_id: string;
      order_number: string | null;
      transaction_id: string | null;
      amount: string;
      status: string;
      event_type: string;
      metadata: string | null;
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number || undefined,
      transactionId: row.transaction_id || undefined,
      amount: row.amount,
      status: row.status as ReconciliationEntry['status'],
      eventType: row.event_type as ReconciliationEntry['eventType'],
      metadata: row.metadata || undefined,
      createdAt: row.created_at,
    }));
  }

  async getReconciliationByTransactionId(
    transactionId: string
  ): Promise<ReconciliationEntry[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT id, order_id, order_number, transaction_id, amount, status, event_type, metadata, created_at
         FROM reconciliation_log
         WHERE transaction_id = ?
         ORDER BY created_at DESC`
      )
      .all(transactionId) as Array<{
      id: string;
      order_id: string;
      order_number: string | null;
      transaction_id: string | null;
      amount: string;
      status: string;
      event_type: string;
      metadata: string | null;
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number || undefined,
      transactionId: row.transaction_id || undefined,
      amount: row.amount,
      status: row.status as ReconciliationEntry['status'],
      eventType: row.event_type as ReconciliationEntry['eventType'],
      metadata: row.metadata || undefined,
      createdAt: row.created_at,
    }));
  }

  async getPendingReconciliations(): Promise<ReconciliationEntry[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT id, order_id, order_number, transaction_id, amount, status, event_type, metadata, created_at
         FROM reconciliation_log
         WHERE status IN ('pending', 'mismatch')
         ORDER BY created_at ASC`
      )
      .all() as Array<{
      id: string;
      order_id: string;
      order_number: string | null;
      transaction_id: string | null;
      amount: string;
      status: string;
      event_type: string;
      metadata: string | null;
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number || undefined,
      transactionId: row.transaction_id || undefined,
      amount: row.amount,
      status: row.status as ReconciliationEntry['status'],
      eventType: row.event_type as ReconciliationEntry['eventType'],
      metadata: row.metadata || undefined,
      createdAt: row.created_at,
    }));
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async cleanupExpiredEntries(): Promise<{
    rateLimits: number;
    idempotency: number;
    csrf: number;
  }> {
    const db = this.getDb();
    const now = Date.now();

    const rateLimitsResult = db
      .prepare(`DELETE FROM rate_limits WHERE expires_at < ?`)
      .run(now);

    const idempotencyResult = db
      .prepare(`DELETE FROM idempotency_keys WHERE expires_at < ?`)
      .run(now);

    const csrfResult = db
      .prepare(`DELETE FROM csrf_tokens WHERE expires_at < ?`)
      .run(now);

    return {
      rateLimits: rateLimitsResult.changes,
      idempotency: idempotencyResult.changes,
      csrf: csrfResult.changes,
    };
  }
}
