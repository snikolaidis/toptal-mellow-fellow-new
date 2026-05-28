/**
 * Imports blog articles from migration/data/blog-articles/<blog>.jsonl into native WP posts.
 * Idempotent: matches by slug. Existing posts updated, new created.
 *
 * Run: npm run migrate:blog-articles
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wp, wpFindBySlug } from './lib/wp';

const BLOG_DIR = path.join(DATA_DIR, 'blog-articles');
const MAP_FILE = path.join(DATA_DIR, '_maps', 'blog-articles.json');

interface ShopifyArticle {
  id: string;
  title: string;
  handle: string;
  body: string;
  author?: { name?: string };
  tags?: string[];
  publishedAt?: string;
  updatedAt?: string;
  isPublished: boolean;
  _blogHandle?: string;
}

async function main() {
  ensureDirs();
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  markRunning('import-blog-articles');

  if (!fs.existsSync(BLOG_DIR)) {
    markFailed('import-blog-articles', 'blog-articles/ folder missing');
    process.exit(1);
  }

  const idMap: Record<string, number> = fs.existsSync(MAP_FILE)
    ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
    : {};

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.jsonl'));
  let totalDone = 0;
  let totalFailed = 0;

  for (const file of files) {
    const lines = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8').split('\n').filter((l) => l.trim());
    log.step(`importing ${lines.length} articles from ${file}`);

    let done = 0;
    let failed = 0;

    for (const line of lines) {
      const a = JSON.parse(line) as ShopifyArticle;
      try {
        const existing = await wpFindBySlug<{ id: number }>('posts', a.handle);
        const body = {
          title: a.title,
          slug: a.handle,
          content: a.body || '',
          status: a.isPublished ? 'publish' : 'draft',
          date: a.publishedAt || undefined,
          modified: a.updatedAt || undefined,
          excerpt: '',
          meta: {
            _shopify_id: a.id,
            _shopify_blog_handle: a._blogHandle || '',
            _shopify_author: a.author?.name || '',
          },
        };
        const result = existing
          ? await wp<{ id: number }>(`/wp-json/wp/v2/posts/${existing.id}`, { method: 'POST', body })
          : await wp<{ id: number }>('/wp-json/wp/v2/posts', { method: 'POST', body });
        idMap[a.id] = result.id;
        done++;
        if (done % 50 === 0) {
          log.info(`  progress ${done}/${lines.length}`);
          fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
        }
      } catch (e) {
        failed++;
        if (failed <= 5) log.err(`  ${a.handle}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    log.ok(`  ${file}: ${done} ok, ${failed} failed`);
    totalDone += done;
    totalFailed += failed;
    fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
  }

  log.ok(`total articles: ${totalDone} imported, ${totalFailed} failed`);
  markDone('import-blog-articles', totalDone);
}

main().catch((e) => {
  markFailed('import-blog-articles', e instanceof Error ? e.message : String(e));
  log.err('import-blog-articles failed', e);
  process.exit(1);
});
