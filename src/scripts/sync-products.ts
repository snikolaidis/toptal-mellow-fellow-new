/**
 * Product Sync Script
 *
 * Fetches all products from WPEngine GraphQL and syncs them to Postgres.
 * Run: npx tsx src/scripts/sync-products.ts
 *
 * Uses batches of 100 with delays to avoid overwhelming WPEngine.
 */

import 'dotenv/config';
import { Pool } from 'pg';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const DB_URL = process.env.DATABASE_URL;

if (!WP_URL) {
  console.error('NEXT_PUBLIC_WORDPRESS_URL not set');
  process.exit(1);
}

if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const PRODUCT_QUERY = `
  query SyncProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, where: { status: "publish" }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on SimpleProduct {
          id databaseId name slug type
          description shortDescription sku
          price regularPrice salePrice
          stockStatus stockQuantity
          image { id sourceUrl altText }
          galleryImages { nodes { id sourceUrl altText } }
          productCategories { nodes { id name slug } }
          collections { nodes { name slug } }
          strainTypes { nodes { name slug } }
          strainNames { nodes { name slug } }
          blendTypes { nodes { name slug } }
          productLines { nodes { name slug } }
          size { nodes { name slug } }
          mfproductTypes { nodes { name slug } }
          cannabinoids { nodes { name slug } }
          singleCannabinoid { nodes { name slug } }
          mG { nodes { name slug } }
          pieces { nodes { name slug } }
        }
        ... on VariableProduct {
          id databaseId name slug type
          description shortDescription sku
          price regularPrice salePrice
          stockStatus
          image { id sourceUrl altText }
          galleryImages { nodes { id sourceUrl altText } }
          productCategories { nodes { id name slug } }
          collections { nodes { name slug } }
          variations { nodes { id databaseId name price regularPrice salePrice stockStatus attributes { nodes { name value } } } }
          strainTypes { nodes { name slug } }
          strainNames { nodes { name slug } }
          blendTypes { nodes { name slug } }
          productLines { nodes { name slug } }
          size { nodes { name slug } }
          mfproductTypes { nodes { name slug } }
          cannabinoids { nodes { name slug } }
          singleCannabinoid { nodes { name slug } }
          mG { nodes { name slug } }
          pieces { nodes { name slug } }
        }
      }
    }
  }
`;

function extractTaxonomies(product: any): Record<string, Array<{ name: string; slug: string }>> {
  const tax: Record<string, Array<{ name: string; slug: string }>> = {};
  const fields: Record<string, string> = {
    productType: 'mfproductTypes',
    size: 'size',
    strainType: 'strainTypes',
    blendType: 'blendTypes',
    cannabinoid: 'cannabinoids',
    singleCannabinoid: 'singleCannabinoid',
    mg: 'mG',
    pieces: 'pieces',
  };

  for (const [key, field] of Object.entries(fields)) {
    const nodes = product[field]?.nodes;
    if (nodes?.length) {
      tax[key] = nodes.map((n: any) => ({ name: n.name, slug: n.slug }));
    }
  }

  return tax;
}

async function fetchBatch(after: string | null): Promise<{ products: any[]; hasNext: boolean; cursor: string | null }> {
  const res = await fetch(`${WP_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: PRODUCT_QUERY,
      variables: { first: 100, after },
    }),
  });

  const json = await res.json();

  if (json.errors) {
    console.error('GraphQL errors:', json.errors.map((e: any) => e.message).join(', '));
    return { products: [], hasNext: false, cursor: null };
  }

  const data = json.data?.products;
  return {
    products: data?.nodes || [],
    hasNext: data?.pageInfo?.hasNextPage || false,
    cursor: data?.pageInfo?.endCursor || null,
  };
}

async function createSchema() {
  await pool.query(`
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
  console.log('Schema created/verified');
}

async function upsertProduct(product: any) {
  const taxonomies = extractTaxonomies(product);
  const collections = product.collections?.nodes || [];

  await pool.query(
    `INSERT INTO products (
      database_id, id, name, slug, price, regular_price, sale_price,
      stock_status, image_url, image_alt, description, short_description,
      sku, taxonomies, collections, raw_data, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
    ON CONFLICT (database_id) DO UPDATE SET
      id=EXCLUDED.id, name=EXCLUDED.name, slug=EXCLUDED.slug,
      price=EXCLUDED.price, regular_price=EXCLUDED.regular_price,
      sale_price=EXCLUDED.sale_price, stock_status=EXCLUDED.stock_status,
      image_url=EXCLUDED.image_url, image_alt=EXCLUDED.image_alt,
      description=EXCLUDED.description, short_description=EXCLUDED.short_description,
      sku=EXCLUDED.sku, taxonomies=EXCLUDED.taxonomies, collections=EXCLUDED.collections,
      raw_data=EXCLUDED.raw_data, updated_at=NOW()`,
    [
      product.databaseId,
      product.id,
      product.name,
      product.slug,
      product.price || null,
      product.regularPrice || null,
      product.salePrice || null,
      product.stockStatus || 'IN_STOCK',
      product.image?.sourceUrl || null,
      product.image?.altText || null,
      product.description || null,
      product.shortDescription || null,
      product.sku || null,
      JSON.stringify(taxonomies),
      JSON.stringify(collections),
      JSON.stringify(product),
    ]
  );
}

async function main() {
  console.log(`Syncing products from ${WP_URL} to Postgres...`);
  console.log(`Database: ${DB_URL?.substring(0, 30)}...`);

  await createSchema();

  let after: string | null = null;
  let totalSynced = 0;
  let batch = 0;

  while (true) {
    batch++;
    console.log(`\nBatch ${batch}: fetching 100 products...`);

    const { products, hasNext, cursor } = await fetchBatch(after);

    if (products.length === 0 && !hasNext) {
      console.log('No more products');
      break;
    }

    for (const product of products) {
      try {
        await upsertProduct(product);
        totalSynced++;
      } catch (err) {
        console.error(`Failed to sync ${product.name}:`, (err as Error).message);
      }
    }

    console.log(`  Synced ${products.length} products (total: ${totalSynced})`);

    if (!hasNext) break;
    after = cursor;

    // Delay between batches to be kind to WPEngine
    console.log('  Waiting 2s before next batch...');
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nSync complete! ${totalSynced} products synced to Postgres.`);

  // Verify
  const count = await pool.query('SELECT COUNT(*) as count FROM products');
  console.log(`Database has ${count.rows[0].count} products.`);

  await pool.end();
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
