/**
 * Storage Factory
 *
 * Provides a singleton storage instance based on environment configuration.
 * Supports SQLite for development and Redis for production.
 */

import type { IStorage, StorageConfig } from './types';
import { SQLiteStorage } from './sqlite';
import { RedisStorage } from './redis';

let storageInstance: IStorage | null = null;
let initializationPromise: Promise<IStorage> | null = null;

/**
 * Create a storage instance based on configuration
 */
export function createStorage(config: StorageConfig): IStorage {
  switch (config.type) {
    case 'sqlite':
      return new SQLiteStorage(config.sqlitePath || './data/payment.db');
    case 'redis':
      if (!config.redisUrl) {
        throw new Error('REDIS_URL is required when STORAGE_TYPE=redis');
      }
      return new RedisStorage(config.redisUrl, config.redisPrefix);
    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

/**
 * Get the singleton storage instance
 * Initializes on first call, returns existing instance on subsequent calls
 */
export async function getStorage(): Promise<IStorage> {
  // Return existing instance if available
  if (storageInstance) {
    return storageInstance;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    const storageType = (process.env.STORAGE_TYPE || 'sqlite') as
      | 'sqlite'
      | 'redis';

    const config: StorageConfig = {
      type: storageType,
      sqlitePath: process.env.SQLITE_PATH || './data/payment.db',
      redisUrl: process.env.REDIS_URL,
    };

    const storage = createStorage(config);
    await storage.initialize();
    storageInstance = storage;

    return storage;
  })();

  return initializationPromise;
}

/**
 * Close the storage connection
 * Useful for graceful shutdown
 */
export async function closeStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.close();
    storageInstance = null;
    initializationPromise = null;
  }
}

// Re-export types for convenience
export * from './types';
