/**
 * Redis GraphQL Response Cache
 *
 * Caches WPEngine GraphQL responses in Redis to eliminate the ~1s round trip
 * on repeat requests. Cache keys are derived from the query + variables hash.
 *
 * Usage:
 *   const data = await cachedQuery(client, { query, variables }, { ttl: 300 });
 *
 * TTL guidelines:
 *   - Product listings: 120-300s (products change infrequently)
 *   - Search results: 300s (same search = same results)
 *   - Taxonomy terms: 600s (rarely change)
 *   - Cart data: NO CACHE (session-specific, mutation-driven)
 *   - User data: NO CACHE (personal, changes on action)
 */

import Redis from 'ioredis';
import crypto from 'crypto';
import type { ApolloClient, DocumentNode } from '@apollo/client';

const CACHE_PREFIX = 'gql:';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 2000,
      lazyConnect: true,
    });
    redis.connect().catch(() => {
      redis = null;
    });
    return redis;
  } catch {
    return null;
  }
}

function hashKey(query: DocumentNode | string, variables?: Record<string, any>): string {
  const queryStr = typeof query === 'string' ? query : query.loc?.source?.body || '';
  const input = queryStr + JSON.stringify(variables || {});
  return CACHE_PREFIX + crypto.createHash('md5').update(input).digest('hex');
}

interface CachedQueryOptions {
  ttl?: number; // seconds, default 120
}

/**
 * Execute a GraphQL query with Redis caching.
 * Falls back to direct Apollo query if Redis is unavailable.
 */
export async function cachedQuery<T = any>(
  client: ApolloClient<any>,
  options: {
    query: DocumentNode;
    variables?: Record<string, any>;
    fetchPolicy?: string;
  },
  cacheOptions: CachedQueryOptions = {}
): Promise<{ data: T }> {
  const { ttl = 120 } = cacheOptions;
  const r = getRedis();
  const key = hashKey(options.query, options.variables);

  // Try cache first
  if (r) {
    try {
      const cached = await r.get(key);
      if (cached) {
        return { data: JSON.parse(cached) };
      }
    } catch {
      // Redis error — fall through to direct query
    }
  }

  // Cache miss — query WPEngine
  const result = await client.query({
    query: options.query,
    variables: options.variables,
    fetchPolicy: (options.fetchPolicy as any) || 'no-cache',
  });

  // Store in cache (non-blocking)
  if (r && result.data) {
    r.setex(key, ttl, JSON.stringify(result.data)).catch(() => {});
  }

  return { data: result.data };
}

/**
 * Invalidate cache entries matching a prefix pattern.
 * Useful after product updates or webhook events.
 */
export async function invalidateCache(pattern?: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;

  try {
    const searchPattern = pattern
      ? `${CACHE_PREFIX}${pattern}*`
      : `${CACHE_PREFIX}*`;
    const keys = await r.keys(searchPattern);
    if (keys.length > 0) {
      await r.del(...keys);
    }
    return keys.length;
  } catch {
    return 0;
  }
}
