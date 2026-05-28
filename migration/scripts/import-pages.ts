/**
 * Imports pages from migration/data/pages.jsonl into native WP pages.
 * Idempotent: matches by slug. Existing pages updated, new created.
 *
 * Run: npm run migrate:pages
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wp, wpFindBySlug } from './lib/wp';

const PAGES_FILE = path.join(DATA_DIR, 'pages.jsonl');
const MAP_FILE = path.join(DATA_DIR, '_maps', 'pages.json');

interface ShopifyPage {
  id: string;
  title: string;
  handle: string;
  body: string;
  isPublished: boolean;
}

async function main() {
  ensureDirs();
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  markRunning('import-pages');

  if (!fs.existsSync(PAGES_FILE)) {
    markFailed('import-pages', 'pages.jsonl missing');
    process.exit(1);
  }

  const idMap: Record<string, number> = fs.existsSync(MAP_FILE)
    ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
    : {};

  const lines = fs.readFileSync(PAGES_FILE, 'utf8').split('\n').filter((l) => l.trim());
  log.step(`importing ${lines.length} pages`);

  let done = 0;
  let failed = 0;

  for (const line of lines) {
    const p = JSON.parse(line) as ShopifyPage;
    try {
      const existing = await wpFindBySlug<{ id: number }>('pages', p.handle);
      const body = {
        title: p.title,
        slug: p.handle,
        content: p.body || '',
        status: p.isPublished ? 'publish' : 'draft',
        meta: { _shopify_id: p.id },
      };
      const result = existing
        ? await wp<{ id: number }>(`/wp-json/wp/v2/pages/${existing.id}`, { method: 'POST', body })
        : await wp<{ id: number }>('/wp-json/wp/v2/pages', { method: 'POST', body });
      idMap[p.id] = result.id;
      done++;
      if (done % 10 === 0) {
        fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
      }
    } catch (e) {
      failed++;
      log.err(`page ${p.handle}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
  log.ok(`pages: ${done} imported, ${failed} failed`);
  markDone('import-pages', done);
}

main().catch((e) => {
  markFailed('import-pages', e instanceof Error ? e.message : String(e));
  log.err('import-pages failed', e);
  process.exit(1);
});
