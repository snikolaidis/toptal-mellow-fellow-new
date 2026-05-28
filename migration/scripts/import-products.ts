/**
 * Imports products from migration/data/products.jsonl into WooCommerce.
 *
 * 1. Groups bulk JSONL child records (variants, metafields, media) under their parents
 * 2. Maps Shopify metafields to ACF fields per our schema
 * 3. Maps Shopify collection IDs to WC category IDs (using collections map)
 * 4. Maps Shopify metaobject refs to WP post IDs (using metaobjects map)
 * 5. Creates or updates products in Woo by slug (handle)
 *
 * Run: npm run migrate:products
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wcUpsertProduct } from './lib/woo';
import { wp, wpSetAcf } from './lib/wp';

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.jsonl');
const COLLECTIONS_MAP = path.join(DATA_DIR, '_maps', 'collections.json');
const METAOBJECTS_MAP = path.join(DATA_DIR, '_maps', 'metaobjects.json');
const PRODUCT_MAP_FILE = path.join(DATA_DIR, '_maps', 'products.json');

// Maps Shopify metafield (namespace.key) to ACF field name
const METAFIELD_TO_ACF: Record<string, string> = {
  'custom.cannabinoid': 'cannabinoid',
  'custom.single_cannabinoid': 'single_cannabinoid',
  'custom.strain_type': 'strain_type',
  'custom.strain_name': 'strain_name',
  'custom.experience_type': 'experience_type',
  'custom.product_type': 'product_type_custom',
  'custom.size': 'size',
  'custom.mgs': 'mgs',
  'custom.pieces': 'pieces',
  'custom.line_collection': 'line_collection',
  'custom.noid_or_blend_description_title': 'noid_or_blend_description_title',
  'custom.what_is_noid_': 'what_is_noid',
  'custom.new_noid_blend_descriptons': 'new_noid_blend_descriptons',
  'custom.device_specifications': 'device_specifications',
  'custom.directions_for_use': 'directions_for_use',
  'custom.ingredients_v2': 'ingredients_v2',
  'custom.serving_size': 'serving_size',
  'custom.disclaimers': 'disclaimers',
  'custom.coa_linkk': 'coa_link',
  'custom.user_manual': 'user_manual',
  'custom.blends_highlights': 'blends_highlights',
  'custom.device_faqs_reference': 'device_faqs_reference',
  'custom.device_faq_test': 'device_faq_test',
  'custom.blend_noid_faqs_reference': 'blend_noid_faqs_reference',
  'custom.new_noid_blend_descriptions_reference': 'new_noid_blend_descriptions_reference',
  'custom.badges': 'badges',
  'mm-google-shopping.custom_product': 'google_custom_product',
};

interface RawRecord {
  id?: string;
  __parentId?: string;
  __typename?: string;
  [key: string]: unknown;
}

interface GroupedProduct {
  raw: RawRecord;
  variants: RawRecord[];
  metafields: RawRecord[];
  media: RawRecord[];
}

function groupProducts(file: string): Map<string, GroupedProduct> {
  const products = new Map<string, GroupedProduct>();
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as RawRecord;
    const gid = String(rec.id || '');
    const parent = rec.__parentId;
    if (gid.includes('/Product/') && !parent) {
      products.set(gid, { raw: rec, variants: [], metafields: [], media: [] });
    } else if (parent) {
      const p = products.get(parent);
      if (!p) continue;
      if (gid.includes('/ProductVariant/')) p.variants.push(rec);
      else if (gid.includes('/MediaImage/') || gid.includes('/Video/')) p.media.push(rec);
      else if (rec.namespace && rec.key) p.metafields.push(rec);
    }
  }
  return products;
}

function parseListValue(v: string): string[] {
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [v];
  } catch {
    return [v];
  }
}

function buildAcfPayload(
  metafields: RawRecord[],
  metaobjectsMap: Record<string, number>
): Record<string, unknown> {
  const acf: Record<string, unknown> = {};
  for (const mf of metafields) {
    const key = `${mf.namespace}.${mf.key}`;
    const acfField = METAFIELD_TO_ACF[key];
    if (!acfField) continue;
    const rawValue = String(mf.value || '');
    const type = String(mf.type || '');

    if (type === 'metaobject_reference') {
      const wpId = metaobjectsMap[rawValue];
      acf[acfField] = wpId || null;
    } else if (type === 'list.metaobject_reference') {
      const ids = parseListValue(rawValue).map((id) => metaobjectsMap[id]).filter(Boolean);
      acf[acfField] = ids;
    } else if (type === 'file_reference') {
      // file_reference points to a Shopify MediaImage/File gid; mapping to a WP attachment id
      // would require running the image upload pipeline first. Skip until then.
      continue;
    } else if (type.startsWith('list.')) {
      const values = parseListValue(rawValue);
      acf[acfField] = values.length === 1 ? values[0] : values.join(', ');
    } else if (type === 'boolean') {
      acf[acfField] = rawValue === 'true';
    } else {
      acf[acfField] = rawValue;
    }
  }
  return acf;
}

async function main() {
  ensureDirs();
  fs.mkdirSync(path.dirname(PRODUCT_MAP_FILE), { recursive: true });
  markRunning('import-products');

  if (!fs.existsSync(PRODUCTS_FILE)) {
    markFailed('import-products', 'products.jsonl missing');
    process.exit(1);
  }

  const collectionsMap: Record<string, number> = fs.existsSync(COLLECTIONS_MAP)
    ? JSON.parse(fs.readFileSync(COLLECTIONS_MAP, 'utf8'))
    : {};
  const metaobjectsMap: Record<string, number> = fs.existsSync(METAOBJECTS_MAP)
    ? JSON.parse(fs.readFileSync(METAOBJECTS_MAP, 'utf8'))
    : {};
  const productMap: Record<string, number> = fs.existsSync(PRODUCT_MAP_FILE)
    ? JSON.parse(fs.readFileSync(PRODUCT_MAP_FILE, 'utf8'))
    : {};

  log.step('grouping bulk records by product');
  const products = groupProducts(PRODUCTS_FILE);
  log.info(`grouped ${products.size} products`);

  let done = 0;
  let failed = 0;

  const force = process.argv.includes('--force');
  for (const [shopifyId, p] of products) {
    if (!force && productMap[shopifyId]) {
      continue;
    }
    const r = p.raw;
    try {
      const slug = String(r.handle || '');
      const acf = buildAcfPayload(p.metafields, metaobjectsMap);

      // Skip variants for now if only the default exists. Single product, single price.
      const firstVariant = p.variants[0] || {};
      const price = String(firstVariant.price || '0');
      const rawSku = String(firstVariant.sku || '');
      const shopIdSuffix = shopifyId.split('/').pop() || '';
      const sku = rawSku;

      // Categories: skipped for now until product is in collections (will be done by post-process)
      // Images: use Shopify CDN URLs for now, replace with WP media after upload-images runs
      const images = p.media
        .filter((m) => m.image)
        .map((m, idx) => ({
          src: String((m.image as { url?: string })?.url || ''),
          alt: String((m.image as { altText?: string })?.altText || ''),
          position: idx,
        }))
        .filter((i) => i.src);

      const payload = {
        slug,
        name: String(r.title || ''),
        type: 'simple',
        status: r.status === 'ACTIVE' ? 'publish' : 'draft',
        description: String(r.descriptionHtml || ''),
        short_description: '',
        sku,
        regular_price: price,
        manage_stock: false,
        tags: Array.isArray(r.tags)
          ? (r.tags as string[]).map((t) => ({ name: t }))
          : [],
        images,
        meta_data: [
          { key: '_shopify_id', value: shopifyId },
          { key: '_shopify_handle', value: slug },
        ],
      };

      let wcProduct: { id: number; slug: string };
      try {
        wcProduct = await wcUpsertProduct(payload);
      } catch (innerErr) {
        // Retry with unique SKU if duplicate
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (msg.includes('product_invalid_sku') && sku) {
          (payload as Record<string, unknown>).sku = `${sku}-mf${shopIdSuffix}`;
          wcProduct = await wcUpsertProduct(payload);
        } else {
          throw innerErr;
        }
      }
      productMap[shopifyId] = wcProduct.id;

      // Set ACF in a separate call
      if (Object.keys(acf).length > 0) {
        await wpSetAcf('product', wcProduct.id, acf);
      }

      done++;
      if (done % 25 === 0) {
        log.info(`progress ${done}/${products.size}`);
        fs.writeFileSync(PRODUCT_MAP_FILE, JSON.stringify(productMap, null, 2));
      }
    } catch (e) {
      failed++;
      log.err(`product ${r.handle}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  fs.writeFileSync(PRODUCT_MAP_FILE, JSON.stringify(productMap, null, 2));
  log.ok(`products: ${done} imported, ${failed} failed`);
  markDone('import-products', done);
}

main().catch((e) => {
  markFailed('import-products', e instanceof Error ? e.message : String(e));
  log.err('import-products failed', e);
  process.exit(1);
});
