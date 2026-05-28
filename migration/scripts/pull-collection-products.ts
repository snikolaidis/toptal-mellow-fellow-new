/**
 * Bulk pull product memberships per collection from Shopify.
 *
 * Writes migration/data/collection-products.jsonl with structure:
 *   {"id":"gid://shopify/Collection/...","title":"..."}
 *   {"id":"gid://shopify/Product/...","__parentId":"gid://shopify/Collection/..."}
 *
 * Run: tsx migration/scripts/pull-collection-products.ts
 */

import { log } from './lib/logger';
import { ensureDirs, dataPath } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { runBulkAndDownload } from './lib/shopify';

async function main() {
  ensureDirs();
  markRunning('collection-products');
  const inner = `
    {
      collections {
        edges {
          node {
            id
            handle
            products {
              edges { node { id handle } }
            }
          }
        }
      }
    }
  `;
  try {
    const count = await runBulkAndDownload(inner, dataPath('collection-products.jsonl'));
    markDone('collection-products', count);
    log.ok(`collection-products: ${count} records`);
  } catch (e) {
    markFailed('collection-products', e instanceof Error ? e.message : String(e));
    log.err('failed', e);
    process.exit(1);
  }
}

main();
