/**
 * Product Query Functions — Postgres Read Layer
 *
 * Fast product queries (<20ms) from the local Postgres database.
 * Falls back to null if DATABASE_URL is not configured, so calling
 * code can use GraphQL as a fallback.
 */

import { getDb } from './db';
import type { Product } from '@/types/woocommerce';
import { FilterGroup, FILTER_GROUPS, ActiveFilters } from './shopFilters';

/**
 * Transform a Postgres row into the Product shape components expect.
 * Uses raw_data JSONB which contains the full GraphQL product node.
 */
function rowToProduct(row: any): Product {
  // raw_data contains the full product node from GraphQL
  if (row.raw_data) {
    return row.raw_data as Product;
  }
  // Fallback: build from individual columns
  return {
    __typename: 'SimpleProduct',
    id: row.id,
    databaseId: row.database_id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    regularPrice: row.regular_price,
    salePrice: row.sale_price,
    stockStatus: row.stock_status,
    image: row.image_url ? { sourceUrl: row.image_url, altText: row.image_alt || '', id: '' } : undefined,
    description: row.description,
    shortDescription: row.short_description,
    sku: row.sku,
  } as Product;
}

/**
 * Get all published products. Returns null if Postgres is unavailable.
 */
export async function getAllProducts(): Promise<Product[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const result = await db.query(
      'SELECT raw_data FROM products ORDER BY database_id DESC'
    );
    return result.rows.map(rowToProduct);
  } catch (err) {
    console.error('[ProductDB] getAllProducts failed:', err);
    return null;
  }
}

/**
 * Get a single product by slug. Returns null if not found or Postgres unavailable.
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const result = await db.query(
      'SELECT raw_data FROM products WHERE slug = $1',
      [slug]
    );
    if (result.rows.length === 0) return null;
    return rowToProduct(result.rows[0]);
  } catch (err) {
    console.error('[ProductDB] getProductBySlug failed:', err);
    return null;
  }
}

/**
 * Search products by name. Uses PostgreSQL full-text search with ILIKE fallback.
 */
export async function searchProducts(query: string, limit = 100): Promise<Product[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    // Use ts_rank for relevance ordering + ILIKE for partial matches
    const result = await db.query(
      `SELECT raw_data,
              ts_rank(to_tsvector('english', name), plainto_tsquery('english', $1)) as rank
       FROM products
       WHERE to_tsvector('english', name) @@ plainto_tsquery('english', $1)
          OR name ILIKE $2
       ORDER BY rank DESC, database_id DESC
       LIMIT $3`,
      [query, `%${query}%`, limit]
    );
    return result.rows.map(rowToProduct);
  } catch (err) {
    console.error('[ProductDB] searchProducts failed:', err);
    return null;
  }
}

/**
 * Get products by collection slug.
 */
export async function getProductsByCollection(collectionSlug: string): Promise<Product[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const result = await db.query(
      `SELECT raw_data FROM products
       WHERE collections @> $1::jsonb
       ORDER BY database_id DESC`,
      [JSON.stringify([{ slug: collectionSlug }])]
    );
    return result.rows.map(rowToProduct);
  } catch (err) {
    console.error('[ProductDB] getProductsByCollection failed:', err);
    return null;
  }
}

/**
 * Get taxonomy data for all products (for building filter sidebar).
 * Returns a map of { filterKey: [{ slug, name, count }] }.
 */
export async function getTaxonomyFacets(): Promise<Record<string, Array<{ name: string; slug: string; count: number }>> | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const result = await db.query('SELECT taxonomies FROM products');
    const facets: Record<string, Map<string, { name: string; slug: string; count: number }>> = {};

    for (const row of result.rows) {
      const tax = row.taxonomies || {};
      for (const [key, terms] of Object.entries(tax)) {
        if (!facets[key]) facets[key] = new Map();
        for (const term of terms as Array<{ name: string; slug: string }>) {
          const existing = facets[key].get(term.slug);
          if (existing) {
            existing.count++;
          } else {
            facets[key].set(term.slug, { name: term.name, slug: term.slug, count: 1 });
          }
        }
      }
    }

    const result2: Record<string, Array<{ name: string; slug: string; count: number }>> = {};
    for (const [key, map] of Object.entries(facets)) {
      result2[key] = Array.from(map.values());
    }
    return result2;
  } catch (err) {
    console.error('[ProductDB] getTaxonomyFacets failed:', err);
    return null;
  }
}

/**
 * Build filter groups from a product set's taxonomy data.
 * Used for self-narrowing filters.
 */
export function buildFilterGroups(products: Product[]): FilterGroup[] {
  // Extract taxonomies from raw_data
  const facetMap: Record<string, Map<string, { name: string; slug: string; count: number }>> = {};

  const TAXONOMY_FIELDS: Record<string, string> = {
    productType: 'mfproductTypes',
    size: 'size',
    strainType: 'strainTypes',
    blendType: 'blendTypes',
    cannabinoid: 'cannabinoids',
    singleCannabinoid: 'singleCannabinoid',
    mg: 'mG',
    pieces: 'pieces',
  };

  for (const product of products) {
    const p = product as any;
    for (const [filterKey, fieldName] of Object.entries(TAXONOMY_FIELDS)) {
      const terms = p?.[fieldName]?.nodes || [];
      if (!facetMap[filterKey]) facetMap[filterKey] = new Map();
      for (const term of terms) {
        if (!term?.slug) continue;
        const existing = facetMap[filterKey].get(term.slug);
        if (existing) existing.count++;
        else facetMap[filterKey].set(term.slug, { name: term.name, slug: term.slug, count: 1 });
      }
    }
  }

  return FILTER_GROUPS.map((fg) => ({
    key: fg.key,
    label: fg.label,
    terms: Array.from(facetMap[fg.key]?.values() || []),
  }));
}
