/**
 * Redis Storage Implementation
 *
 * Uses ioredis for production-grade Redis access.
 * Suitable for distributed deployments (e.g., Railway, multi-instance).
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import type {
  IStorage,
  RateLimitEntry,
  IdempotencyEntry,
  CsrfTokenEntry,
  ReconciliationEntry,
  AuthSession,
} from './types';

export class RedisStorage implements IStorage {
  private client: Redis | null = null;
  private redisUrl: string;
  private prefix: string;

  constructor(redisUrl: string, prefix: string = 'store:') {
    this.redisUrl = redisUrl;
    this.prefix = prefix;
  }

  private key(namespace: string, id: string): string {
    return `${this.prefix}${namespace}:${id}`;
  }

  async initialize(): Promise<void> {
    this.client = new Redis(this.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
    });

    // Prevent unhandled 'error' events from crashing the Node process during
    // background reconnection attempts.
    this.client.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });

    // Verify connection
    await this.client.ping();
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }
    return this.client;
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  async getRateLimit(key: string): Promise<RateLimitEntry | null> {
    const client = this.getClient();
    const data = await client.get(this.key('rate', key));
    if (!data) return null;

    const entry = JSON.parse(data) as RateLimitEntry;
    if (entry.expiresAt <= Date.now()) return null;
    return entry;
  }

  async incrementRateLimit(
    key: string,
    windowMs: number,
    _maxAttempts: number
  ): Promise<RateLimitEntry> {
    const client = this.getClient();
    const redisKey = this.key('rate', key);
    const now = Date.now();

    const existing = await this.getRateLimit(key);

    if (existing) {
      const updated: RateLimitEntry = {
        ...existing,
        count: existing.count + 1,
      };
      const ttlMs = existing.expiresAt - now;
      await client.set(redisKey, JSON.stringify(updated), 'PX', Math.max(ttlMs, 1));
      return updated;
    }

    const entry: RateLimitEntry = {
      key,
      count: 1,
      windowStart: now,
      expiresAt: now + windowMs,
    };
    await client.set(redisKey, JSON.stringify(entry), 'PX', windowMs);
    return entry;
  }

  async clearRateLimit(key: string): Promise<void> {
    const client = this.getClient();
    await client.del(this.key('rate', key));
  }

  // ============================================================================
  // Idempotency
  // ============================================================================

  async getIdempotencyEntry(key: string): Promise<IdempotencyEntry | null> {
    const client = this.getClient();
    const data = await client.get(this.key('idem', key));
    if (!data) return null;

    const entry = JSON.parse(data) as IdempotencyEntry;
    if (entry.expiresAt <= Date.now()) return null;
    return entry;
  }

  async createIdempotencyEntry(
    entry: Omit<IdempotencyEntry, 'createdAt'>
  ): Promise<IdempotencyEntry> {
    const client = this.getClient();
    const now = Date.now();
    const full: IdempotencyEntry = { ...entry, createdAt: now };
    const ttlMs = entry.expiresAt - now;

    await client.set(
      this.key('idem', entry.key),
      JSON.stringify(full),
      'PX',
      Math.max(ttlMs, 1)
    );
    return full;
  }

  async updateIdempotencyEntry(
    key: string,
    updates: Partial<IdempotencyEntry>
  ): Promise<void> {
    const client = this.getClient();
    const existing = await this.getIdempotencyEntry(key);
    if (!existing) return;

    const updated = { ...existing, ...updates, key };
    const ttlMs = existing.expiresAt - Date.now();
    await client.set(
      this.key('idem', key),
      JSON.stringify(updated),
      'PX',
      Math.max(ttlMs, 1)
    );
  }

  // ============================================================================
  // CSRF Tokens
  // ============================================================================

  async createCsrfToken(
    sessionId: string,
    ttlMs: number = 3600000
  ): Promise<CsrfTokenEntry> {
    const client = this.getClient();
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + ttlMs;

    const entry: CsrfTokenEntry = {
      token,
      sessionId,
      createdAt: now,
      expiresAt,
      used: false,
    };

    await client.set(
      this.key('csrf', token),
      JSON.stringify(entry),
      'PX',
      ttlMs
    );

    return entry;
  }

  async validateCsrfToken(token: string, sessionId: string): Promise<boolean> {
    const client = this.getClient();
    const data = await client.get(this.key('csrf', token));
    if (!data) return false;

    const entry = JSON.parse(data) as CsrfTokenEntry;
    return (
      entry.sessionId === sessionId &&
      entry.expiresAt > Date.now() &&
      !entry.used
    );
  }

  async consumeCsrfToken(token: string): Promise<boolean> {
    const client = this.getClient();
    const redisKey = this.key('csrf', token);
    const data = await client.get(redisKey);
    if (!data) return false;

    const entry = JSON.parse(data) as CsrfTokenEntry;
    if (entry.used) return false;

    entry.used = true;
    const ttlMs = entry.expiresAt - Date.now();
    await client.set(redisKey, JSON.stringify(entry), 'PX', Math.max(ttlMs, 1));
    return true;
  }

  // ============================================================================
  // Reconciliation
  // ============================================================================

  async createReconciliationEntry(
    entry: Omit<ReconciliationEntry, 'id' | 'createdAt'>
  ): Promise<ReconciliationEntry> {
    const client = this.getClient();
    const id = uuidv4();
    const createdAt = Date.now();
    const full: ReconciliationEntry = { id, ...entry, createdAt };

    // Store the entry by ID
    await client.set(this.key('recon', id), JSON.stringify(full));

    // Index by orderId and transactionId for lookups
    await client.sadd(this.key('recon:order', entry.orderId), id);
    if (entry.transactionId) {
      await client.sadd(this.key('recon:txn', entry.transactionId), id);
    }
    if (entry.status === 'pending' || entry.status === 'mismatch') {
      await client.sadd(this.key('recon:pending', '_all'), id);
    }

    return full;
  }

  async updateReconciliationEntry(
    id: string,
    updates: Partial<ReconciliationEntry>
  ): Promise<void> {
    const client = this.getClient();
    const redisKey = this.key('recon', id);
    const data = await client.get(redisKey);
    if (!data) return;

    const existing = JSON.parse(data) as ReconciliationEntry;
    const wasPending =
      existing.status === 'pending' || existing.status === 'mismatch';

    const updated = { ...existing, ...updates, id };
    await client.set(redisKey, JSON.stringify(updated));

    const isPending =
      updated.status === 'pending' || updated.status === 'mismatch';

    // Update pending index
    if (wasPending && !isPending) {
      await client.srem(this.key('recon:pending', '_all'), id);
    } else if (!wasPending && isPending) {
      await client.sadd(this.key('recon:pending', '_all'), id);
    }
  }

  async getReconciliationByOrderId(
    orderId: string
  ): Promise<ReconciliationEntry[]> {
    const client = this.getClient();
    const ids = await client.smembers(this.key('recon:order', orderId));
    return this.getReconciliationEntries(ids);
  }

  async getReconciliationByTransactionId(
    transactionId: string
  ): Promise<ReconciliationEntry[]> {
    const client = this.getClient();
    const ids = await client.smembers(this.key('recon:txn', transactionId));
    return this.getReconciliationEntries(ids);
  }

  async getPendingReconciliations(): Promise<ReconciliationEntry[]> {
    const client = this.getClient();
    const ids = await client.smembers(this.key('recon:pending', '_all'));
    return this.getReconciliationEntries(ids);
  }

  private async getReconciliationEntries(
    ids: string[]
  ): Promise<ReconciliationEntry[]> {
    if (ids.length === 0) return [];

    const client = this.getClient();
    const pipeline = client.pipeline();
    for (const id of ids) {
      pipeline.get(this.key('recon', id));
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const entries: ReconciliationEntry[] = [];
    for (const [err, data] of results) {
      if (!err && data && typeof data === 'string') {
        entries.push(JSON.parse(data));
      }
    }

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ============================================================================
  // Auth Sessions
  // ============================================================================

  async createAuthSession(session: AuthSession): Promise<AuthSession> {
    const client = this.getClient();
    const ttlMs = session.expiresAt - Date.now();
    const pipeline = client.pipeline();
    pipeline.set(
      this.key('session', session.sessionId),
      JSON.stringify(session),
      'PX',
      Math.max(ttlMs, 1),
    );
    pipeline.set(
      this.key('session:refresh', session.refreshTokenHash),
      session.sessionId,
      'PX',
      Math.max(ttlMs, 1),
    );
    pipeline.sadd(
      this.key('session:user', String(session.userId)),
      session.sessionId,
    );
    await pipeline.exec();
    return session;
  }

  async getAuthSessionById(sessionId: string): Promise<AuthSession | null> {
    const client = this.getClient();
    const data = await client.get(this.key('session', sessionId));
    if (!data) return null;
    const session = JSON.parse(data) as AuthSession;
    if (session.expiresAt <= Date.now()) return null;
    return session;
  }

  async getAuthSessionByRefreshTokenHash(
    hash: string,
  ): Promise<AuthSession | null> {
    const client = this.getClient();
    const sessionId = await client.get(this.key('session:refresh', hash));
    if (!sessionId) return null;
    return this.getAuthSessionById(sessionId);
  }

  async getAuthSessionsByUserId(userId: number): Promise<AuthSession[]> {
    const client = this.getClient();
    const ids = await client.smembers(
      this.key('session:user', String(userId)),
    );
    if (ids.length === 0) return [];

    const pipeline = client.pipeline();
    for (const id of ids) {
      pipeline.get(this.key('session', id));
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const now = Date.now();
    const sessions: AuthSession[] = [];
    const expiredIds: string[] = [];
    for (const [err, data] of results) {
      if (!err && data && typeof data === 'string') {
        const s = JSON.parse(data) as AuthSession;
        if (s.expiresAt > now && !s.revoked) {
          sessions.push(s);
        } else {
          expiredIds.push(s.sessionId);
        }
      }
    }
    if (expiredIds.length > 0) {
      await client.srem(
        this.key('session:user', String(userId)),
        ...expiredIds,
      );
    }
    return sessions.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  async updateAuthSessionRefreshToken(
    sessionId: string,
    newHash: string,
  ): Promise<void> {
    const client = this.getClient();
    const data = await client.get(this.key('session', sessionId));
    if (!data) return;

    const session = JSON.parse(data) as AuthSession;
    const oldHash = session.refreshTokenHash;
    session.refreshTokenHash = newHash;
    session.lastUsedAt = Date.now();
    const ttlMs = session.expiresAt - Date.now();

    const pipeline = client.pipeline();
    pipeline.set(
      this.key('session', sessionId),
      JSON.stringify(session),
      'PX',
      Math.max(ttlMs, 1),
    );
    pipeline.del(this.key('session:refresh', oldHash));
    pipeline.set(
      this.key('session:refresh', newHash),
      sessionId,
      'PX',
      Math.max(ttlMs, 1),
    );
    await pipeline.exec();
  }

  async revokeAuthSession(sessionId: string): Promise<void> {
    const client = this.getClient();
    const data = await client.get(this.key('session', sessionId));
    if (!data) return;

    const session = JSON.parse(data) as AuthSession;
    session.revoked = true;
    const ttlMs = Math.max(session.expiresAt - Date.now(), 1);

    const pipeline = client.pipeline();
    pipeline.set(
      this.key('session', sessionId),
      JSON.stringify(session),
      'PX',
      ttlMs,
    );
    pipeline.del(this.key('session:refresh', session.refreshTokenHash));
    await pipeline.exec();
  }

  async revokeAllUserAuthSessions(userId: number): Promise<void> {
    const client = this.getClient();
    const ids = await client.smembers(
      this.key('session:user', String(userId)),
    );
    if (ids.length === 0) return;

    const pipeline = client.pipeline();
    for (const id of ids) {
      pipeline.get(this.key('session', id));
    }
    const results = await pipeline.exec();
    if (!results) return;

    const revokePipeline = client.pipeline();
    for (const [err, data] of results) {
      if (!err && data && typeof data === 'string') {
        const s = JSON.parse(data) as AuthSession;
        s.revoked = true;
        const ttlMs = Math.max(s.expiresAt - Date.now(), 1);
        revokePipeline.set(
          this.key('session', s.sessionId),
          JSON.stringify(s),
          'PX',
          ttlMs,
        );
        revokePipeline.del(
          this.key('session:refresh', s.refreshTokenHash),
        );
      }
    }
    await revokePipeline.exec();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async cleanupExpiredEntries(): Promise<{
    rateLimits: number;
    idempotency: number;
    csrf: number;
    sessions: number;
  }> {
    // Redis handles expiration automatically via TTL (PX/EX).
    return { rateLimits: 0, idempotency: 0, csrf: 0, sessions: 0 };
  }
}
