/**
 * Postgres Database Client
 *
 * Product read layer — replaces WPEngine GraphQL for product queries.
 * Uses connection pooling for efficient server-side usage.
 *
 * If DATABASE_URL is not set, all functions return null/empty so the
 * calling code can fall back to GraphQL.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  return pool;
}

/**
 * Initialize the database schema (creates tables if they don't exist).
 * Safe to call multiple times.
 */
export async function initializeSchema(): Promise<void> {
  const db = getPool();
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      database_id INT PRIMARY KEY,
      id TEXT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      price TEXT,
      regular_price TEXT,
      sale_price TEXT,
      stock_status TEXT DEFAULT 'IN_STOCK',
      image_url TEXT,
      image_alt TEXT,
      description TEXT,
      short_description TEXT,
      sku TEXT,
      taxonomies JSONB DEFAULT '{}',
      collections JSONB DEFAULT '[]',
      raw_data JSONB,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_products_taxonomies ON products USING GIN(taxonomies);
    CREATE INDEX IF NOT EXISTS idx_products_name_search ON products USING GIN(to_tsvector('english', name));
  `);
}

/**
 * Upsert a product into Postgres.
 */
export async function upsertProduct(product: {
  databaseId: number;
  id: string;
  name: string;
  slug: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
  stockStatus?: string;
  imageUrl?: string;
  imageAlt?: string;
  description?: string;
  shortDescription?: string;
  sku?: string;
  taxonomies: Record<string, string[]>;
  collections: Array<{ name: string; slug: string }>;
  rawData: any;
}): Promise<void> {
  const db = getPool();
  if (!db) return;

  await db.query(
    `INSERT INTO products (
      database_id, id, name, slug, price, regular_price, sale_price,
      stock_status, image_url, image_alt, description, short_description,
      sku, taxonomies, collections, raw_data, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
    ON CONFLICT (database_id) DO UPDATE SET
      id = EXCLUDED.id,
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      price = EXCLUDED.price,
      regular_price = EXCLUDED.regular_price,
      sale_price = EXCLUDED.sale_price,
      stock_status = EXCLUDED.stock_status,
      image_url = EXCLUDED.image_url,
      image_alt = EXCLUDED.image_alt,
      description = EXCLUDED.description,
      short_description = EXCLUDED.short_description,
      sku = EXCLUDED.sku,
      taxonomies = EXCLUDED.taxonomies,
      collections = EXCLUDED.collections,
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()`,
    [
      product.databaseId,
      product.id,
      product.name,
      product.slug,
      product.price || null,
      product.regularPrice || null,
      product.salePrice || null,
      product.stockStatus || 'IN_STOCK',
      product.imageUrl || null,
      product.imageAlt || null,
      product.description || null,
      product.shortDescription || null,
      product.sku || null,
      JSON.stringify(product.taxonomies),
      JSON.stringify(product.collections),
      JSON.stringify(product.rawData),
    ]
  );
}

/**
 * Delete a product from Postgres.
 */
export async function deleteProduct(databaseId: number): Promise<void> {
  const db = getPool();
  if (!db) return;
  await db.query('DELETE FROM products WHERE database_id = $1', [databaseId]);
}

/**
 * Check if the database is available and has products.
 */
export async function isDbAvailable(): Promise<boolean> {
  const db = getPool();
  if (!db) return false;
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM products');
    return parseInt(result.rows[0].count) > 0;
  } catch {
    return false;
  }
}

/**
 * Get the raw pool for direct queries (used by product-queries.ts).
 */
export function getDb(): Pool | null {
  return getPool();
}
