/**
 * Assigns WooCommerce categories to existing products based on Shopify collection memberships.
 *
 * Reads:
 * - migration/data/collection-products.jsonl (collection → products membership)
 * - migration/data/_maps/collections.json (shopify_collection_id → wc_category_id)
 * - migration/data/_maps/products.json (shopify_product_id → wc_product_id)
 *
 * For each product, updates WC with all matching categories.
 *
 * Run: tsx migration/scripts/assign-product-categories.ts
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { DATA_DIR, ensureDirs } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wc } from './lib/woo';

const MEMBERSHIP_FILE = path.join(DATA_DIR, 'collection-products.jsonl');
const COLLECTIONS_MAP = path.join(DATA_DIR, '_maps', 'collections.json');
const PRODUCTS_MAP = path.join(DATA_DIR, '_maps', 'products.json');

async function main() {
  ensureDirs();
  markRunning('assign-product-categories');

  if (!fs.existsSync(MEMBERSHIP_FILE)) {
    markFailed('assign-product-categories', 'collection-products.jsonl missing');
    log.err('run pull-collection-products.ts first');
    process.exit(1);
  }

  const collectionsMap: Record<string, number> = JSON.parse(fs.readFileSync(COLLECTIONS_MAP, 'utf8'));
  const productsMap: Record<string, number> = JSON.parse(fs.readFileSync(PRODUCTS_MAP, 'utf8'));

  log.step('building product → categories map');
  const productCategories = new Map<string, Set<number>>();
  for (const line of fs.readFileSync(MEMBERSHIP_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (!rec.__parentId) continue;
    const productId = String(rec.id || '');
    const collectionId = String(rec.__parentId || '');
    if (!productId.includes('/Product/')) continue;

    const wcCatId = collectionsMap[collectionId];
    if (!wcCatId) continue;

    if (!productCategories.has(productId)) productCategories.set(productId, new Set());
    productCategories.get(productId)!.add(wcCatId);
  }

  log.info(`products with categories: ${productCategories.size}`);
  log.info(`products in map: ${Object.keys(productsMap).length}`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const [shopifyProductId, categoryIds] of productCategories) {
    const wcProductId = productsMap[shopifyProductId];
    if (!wcProductId) {
      skipped++;
      continue;
    }
    try {
      const cats = Array.from(categoryIds).map((id) => ({ id }));
      await wc(`/products/${wcProductId}`, {
        method: 'PUT',
        body: { categories: cats },
      });
      done++;
      if (done % 50 === 0) log.info(`progress ${done}/${productCategories.size}`);
    } catch (e) {
      failed++;
      if (failed <= 5) log.err(`product ${wcProductId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log.ok(`updated ${done}, skipped ${skipped} (not yet imported), failed ${failed}`);
  markDone('assign-product-categories', done);
}

main().catch((e) => {
  markFailed('assign-product-categories', e instanceof Error ? e.message : String(e));
  log.err('failed', e);
  process.exit(1);
});
