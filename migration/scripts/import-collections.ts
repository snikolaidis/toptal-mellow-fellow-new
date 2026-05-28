/**
 * Imports collections from migration/data/collections.jsonl into WooCommerce as product categories.
 *
 * Idempotent: matches by slug (handle). Existing categories are updated, new ones created.
 *
 * Writes migration/data/_maps/collections.json with shopify_id to wc_category_id mapping
 * so the product importer can assign products to the right categories.
 *
 * Run: npm run migrate:collections
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wcUpsertCategory } from './lib/woo';

const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.jsonl');
const MAP_FILE = path.join(DATA_DIR, '_maps', 'collections.json');

interface ShopifyCollection {
  id: string;
  handle: string;
  title: string;
  descriptionHtml?: string;
  image?: { url?: string; altText?: string };
}

async function main() {
  ensureDirs();
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  markRunning('import-collections');

  if (!fs.existsSync(COLLECTIONS_FILE)) {
    markFailed('import-collections', 'collections.jsonl missing');
    log.err('collections.jsonl missing, run npm run migrate:pull first');
    process.exit(1);
  }

  const idMap: Record<string, number> = fs.existsSync(MAP_FILE)
    ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
    : {};

  const lines = fs.readFileSync(COLLECTIONS_FILE, 'utf8').split('\n').filter((l) => l.trim());
  log.step(`importing ${lines.length} collections`);

  let done = 0;
  let failed = 0;

  for (const line of lines) {
    const c = JSON.parse(line) as ShopifyCollection;
    try {
      const wcCat = await wcUpsertCategory({
        slug: c.handle,
        name: c.title,
        description: c.descriptionHtml || '',
        image: c.image?.url ? { src: c.image.url } : undefined,
      });
      idMap[c.id] = wcCat.id;
      done++;
      if (done % 25 === 0) {
        log.info(`progress ${done}/${lines.length}`);
        fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
      }
    } catch (e) {
      failed++;
      log.err(`collection ${c.handle} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
  log.ok(`collections: ${done} imported, ${failed} failed`);
  markDone('import-collections', done);
}

main().catch((e) => {
  markFailed('import-collections', e instanceof Error ? e.message : String(e));
  log.err('import-collections failed', e);
  process.exit(1);
});
