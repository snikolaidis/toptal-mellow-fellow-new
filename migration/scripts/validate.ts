/**
 * Reconciles counts between Shopify pull (migration/data/) and WooCommerce destination.
 * Identifies missing records by comparing maps.
 *
 * Run: npm run migrate:validate
 */

import fs from 'fs';
import path from 'path';
import { env } from './lib/env';
import { log } from './lib/logger';
import { DATA_DIR } from './lib/jsonl';

const MAPS_DIR = path.join(DATA_DIR, '_maps');

function countLines(file: string): number {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).length;
}

function countParents(file: string, gidPattern: string): number {
  if (!fs.existsSync(file)) return 0;
  let count = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (String(rec.id || '').includes(gidPattern) && !rec.__parentId) count++;
  }
  return count;
}

async function wcCount(endpoint: string): Promise<number> {
  try {
    const res = await fetch(`${env.wc.url}${endpoint}?per_page=1`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${env.wc.key}:${env.wc.secret}`).toString('base64') },
    });
    return parseInt(res.headers.get('x-wp-total') || '0', 10);
  } catch {
    return 0;
  }
}

async function wpCount(endpoint: string): Promise<number> {
  try {
    const res = await fetch(`${env.wp.url}/wp-json/wp/v2${endpoint}?per_page=1&status=any`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${env.wp.user}:${env.wp.appPassword}`).toString('base64') },
    });
    return parseInt(res.headers.get('x-wp-total') || '0', 10);
  } catch {
    return 0;
  }
}

async function main() {
  log.step('Validating migration counts');

  // Helper to load a map file
  const loadMap = (name: string): Record<string, number> => {
    const p = path.join(MAPS_DIR, name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  };

  // Counts
  const sources = {
    collections: countLines(path.join(DATA_DIR, 'collections.jsonl')),
    pages: countLines(path.join(DATA_DIR, 'pages.jsonl')),
    redirects: countLines(path.join(DATA_DIR, 'redirects.jsonl')),
    products: countParents(path.join(DATA_DIR, 'products.jsonl'), '/Product/'),
    customers: countParents(path.join(DATA_DIR, 'customers.jsonl'), '/Customer/'),
    orders: countParents(path.join(DATA_DIR, 'orders.jsonl'), '/Order/'),
  };

  let blogArticles = 0;
  const blogDir = path.join(DATA_DIR, 'blog-articles');
  if (fs.existsSync(blogDir)) {
    for (const f of fs.readdirSync(blogDir).filter((x) => x.endsWith('.jsonl'))) {
      blogArticles += countLines(path.join(blogDir, f));
    }
  }

  let metaobjects = 0;
  const metaDir = path.join(DATA_DIR, 'metaobjects');
  if (fs.existsSync(metaDir)) {
    for (const f of fs.readdirSync(metaDir).filter((x) => x.endsWith('.jsonl'))) {
      metaobjects += countLines(path.join(metaDir, f));
    }
  }

  // Destination counts
  const dest = {
    collections: await wcCount('/products/categories'),
    pages: await wpCount('/pages'),
    products: await wcCount('/products'),
    customers: await wcCount('/customers'),
    orders: await wcCount('/orders'),
    posts: await wpCount('/posts'),
  };

  log.step('Counts');
  console.log(`  Collections     Shopify=${sources.collections}  Woo=${dest.collections} (incl Uncategorized)`);
  console.log(`  Pages           Shopify=${sources.pages}  WP=${dest.pages}`);
  console.log(`  Posts (blog)    Shopify=${blogArticles}  WP=${dest.posts}`);
  console.log(`  Redirects       Shopify=${sources.redirects}  (Redirection plugin)`);
  console.log(`  Metaobjects     Shopify=${metaobjects}  WP CPTs=(see _maps/metaobjects.json)`);
  console.log(`  Products        Shopify=${sources.products}  Woo=${dest.products}`);
  console.log(`  Customers       Shopify=${sources.customers}  Woo=${dest.customers} (sample)`);
  console.log(`  Orders          Shopify=${sources.orders}  Woo=${dest.orders} (sample)`);

  // Missing products investigation
  const productsMap = loadMap('products.json');
  const missingShopifyIds: string[] = [];
  for (const line of fs.readFileSync(path.join(DATA_DIR, 'products.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    const gid = String(rec.id || '');
    if (gid.includes('/Product/') && !rec.__parentId) {
      if (!productsMap[gid]) {
        missingShopifyIds.push(JSON.stringify({ id: gid, handle: rec.handle, status: rec.status }));
      }
    }
  }
  if (missingShopifyIds.length > 0) {
    log.warn(`Missing products from Woo (${missingShopifyIds.length}):`);
    for (const m of missingShopifyIds.slice(0, 30)) console.log(`  ${m}`);
    if (missingShopifyIds.length > 30) console.log(`  ... and ${missingShopifyIds.length - 30} more`);
  }

  log.ok('validation done');
}

main().catch((e) => {
  log.err('validate failed', e);
  process.exit(1);
});
