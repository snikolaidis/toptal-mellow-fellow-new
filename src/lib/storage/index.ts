import type { IStorage, StorageConfig } from './types';
import { SQLiteStorage } from './sqlite';
import { RedisStorage } from './redis';

let storageInstance: IStorage | null = null;
let initializationPromise: Promise<IStorage> | null = null;

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

export async function getStorage(): Promise<IStorage> {
  if (storageInstance) {
    return storageInstance;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const storageType = (process.env.STORAGE_TYPE || 'sqlite') as
      | 'sqlite'
      | 'redis';

    const config: StorageConfig = {
      type: storageType,
      sqlitePath: process.env.SQLITE_PATH || './data/payment.db',
      redisUrl: process.env.REDIS_URL,
    };

    console.log(`[Storage] Initializing ${storageType} storage...`);

    try {
      const storage = createStorage(config);
      await storage.initialize();
      storageInstance = storage;
      console.log(`[Storage] ${storageType} connected successfully.`);
      return storage;
    } catch (err) {
      initializationPromise = null;
      console.error(`[Storage] ${storageType} initialization failed:`, err);
      throw err;
    }
  })();

  return initializationPromise;
}

export async function closeStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.close();
    storageInstance = null;
    initializationPromise = null;
  }
}

export * from './types';
