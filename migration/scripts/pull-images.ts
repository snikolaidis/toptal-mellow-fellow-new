/**
 * Downloads all product images from Shopify CDN to local disk.
 *
 * Reads migration/data/products.jsonl, extracts image URLs from MediaImage records,
 * dedupes, and downloads each into migration/data/images/.
 *
 * Writes a mapping migration/data/images-map.json from shopify_url to local_path
 * that the upload script will use later.
 *
 * Idempotent: existing files are skipped. Resume safe.
 *
 * Run: tsx migration/scripts/pull-images.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.jsonl');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const MAP_FILE = path.join(DATA_DIR, 'images-map.json');
const CONCURRENCY = 8;

interface ImageEntry {
  shopifyUrl: string;
  parentId?: string;
  altText?: string;
  width?: number;
  height?: number;
  localPath?: string;
  status?: 'pending' | 'downloaded' | 'failed';
  error?: string;
  bytes?: number;
}

function localPathFor(shopifyUrl: string): string {
  const url = new URL(shopifyUrl);
  const ext = path.extname(url.pathname) || '.bin';
  const hash = crypto.createHash('sha1').update(shopifyUrl).digest('hex').slice(0, 12);
  const baseName = path.basename(url.pathname, ext).replace(/[^a-z0-9_.-]/gi, '_').slice(0, 60);
  return path.join(IMAGES_DIR, `${hash}_${baseName}${ext}`);
}

async function downloadOne(entry: ImageEntry): Promise<void> {
  const out = entry.localPath!;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out) && fs.statSync(out).size > 0) {
    entry.status = 'downloaded';
    entry.bytes = fs.statSync(out).size;
    return;
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(entry.shopifyUrl);
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(out, buf);
      entry.status = 'downloaded';
      entry.bytes = buf.length;
      return;
    } catch (e) {
      if (attempt === 4) {
        entry.status = 'failed';
        entry.error = e instanceof Error ? e.message : String(e);
        return;
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function loadExistingMap(): Map<string, ImageEntry> {
  const map = new Map<string, ImageEntry>();
  if (fs.existsSync(MAP_FILE)) {
    const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) as ImageEntry[];
    for (const entry of raw) map.set(entry.shopifyUrl, entry);
  }
  return map;
}

function saveMap(entries: ImageEntry[]): void {
  fs.writeFileSync(MAP_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

async function main() {
  ensureDirs();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  markRunning('images');

  if (!fs.existsSync(PRODUCTS_FILE)) {
    markFailed('images', 'products.jsonl missing, run npm run migrate:pull first');
    log.err('products.jsonl missing, run npm run migrate:pull first');
    process.exit(1);
  }

  log.step('collecting image URLs from products.jsonl');
  const entries = loadExistingMap();
  const lines = fs.readFileSync(PRODUCTS_FILE, 'utf8').split('\n');
  let added = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line) as Record<string, unknown>;
    const id = String(obj.id || '');
    if (!id.includes('/MediaImage/') && !id.includes('/Video/')) continue;
    const image = obj.image as { url?: string; altText?: string; width?: number; height?: number } | undefined;
    if (!image?.url) continue;
    const url = image.url;
    if (!entries.has(url)) {
      entries.set(url, {
        shopifyUrl: url,
        parentId: obj.__parentId as string | undefined,
        altText: image.altText,
        width: image.width,
        height: image.height,
        localPath: localPathFor(url),
        status: 'pending',
      });
      added++;
    }
  }
  log.info(`total images: ${entries.size} (${added} new)`);

  const queue = Array.from(entries.values()).filter((e) => e.status !== 'downloaded');
  log.info(`to download: ${queue.length}`);

  let done = 0;
  let failed = 0;
  const workers: Array<Promise<void>> = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const idx = cursor++;
      const entry = queue[idx];
      await downloadOne(entry);
      if (entry.status === 'downloaded') done++;
      else failed++;
      if ((done + failed) % 50 === 0) {
        log.info(`progress ${done + failed}/${queue.length} (${failed} failed)`);
        saveMap(Array.from(entries.values()));
      }
    }
  }

  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  saveMap(Array.from(entries.values()));
  log.ok(`downloaded ${done}, failed ${failed}, total ${entries.size}`);
  markDone('images', entries.size);
}

main().catch((e) => {
  markFailed('images', e instanceof Error ? e.message : String(e));
  log.err('image pull failed', e);
  process.exit(1);
});
