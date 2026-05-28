/**
 * Imports Shopify metaobjects into the matching WordPress Custom Post Types.
 *
 * Reads migration/data/metaobjects/<type>.jsonl files, maps each Shopify metaobject type
 * to its WP CPT slug (per mu-plugin registration), and creates posts via WP REST.
 *
 * Idempotent: matches by slug (Shopify handle). Updates existing, creates new.
 *
 * Writes migration/data/_maps/metaobjects.json with shopify_id to wp_post_id.
 *
 * Run: npm run migrate:metaobjects
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wp, wpFindBySlug } from './lib/wp';

const META_DIR = path.join(DATA_DIR, 'metaobjects');
const MAP_FILE = path.join(DATA_DIR, '_maps', 'metaobjects.json');

const TYPE_TO_CPT: Record<string, string> = {
  device_fa_qs: 'device_faq',
  blend_noid_fa_qs: 'blend_noid_faq',
  general_fa_qs: 'general_faq',
  device_specs: 'device_spec',
  user_manual_device_specs: 'user_manual_spec',
  noid_blend_descriptions: 'noid_description',
  cannabinoid_info: 'cannabinoid_info',
  coa_links_v_1: 'coa_link_group',
  current_sale_1_metaobject: 'current_sale',
  current_sale_2_metaobject: 'current_sale',
  holiday_sale_info_and_images: 'holiday_sale',
  mellow_matcher_on_page_display: 'mellow_matcher',
  related_collections: 'related_coll_set',
  related_collections_noids_blends: 'related_noids_blends',
  main_collection_relevant_links: 'main_coll_links',
  blend_groups: 'blend_group',
  groups_of_blend_groups: 'blend_group_set',
  learn_about_noid_blend_content: 'learn_blend_content',
  learn_about_noids_content: 'learn_noid_content',
  monthly_review_highlights: 'review_highlight',
  badges: 'mf_badge',
};

interface ShopifyMetaobject {
  id: string;
  type: string;
  handle: string;
  displayName: string;
  fields: Array<{ key: string; value: string | null; type: string }>;
}

function fieldsToMeta(fields: ShopifyMetaobject['fields']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.value !== null && f.value !== undefined) {
      out[f.key] = f.value;
    }
  }
  return out;
}

async function main() {
  ensureDirs();
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  markRunning('import-metaobjects');

  if (!fs.existsSync(META_DIR)) {
    markFailed('import-metaobjects', 'metaobjects/ folder missing');
    process.exit(1);
  }

  const idMap: Record<string, number> = fs.existsSync(MAP_FILE)
    ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
    : {};

  const files = fs.readdirSync(META_DIR).filter((f) => f.endsWith('.jsonl'));
  const skipped: string[] = [];
  let totalDone = 0;
  let totalFailed = 0;

  for (const file of files) {
    const type = file.replace(/\.jsonl$/, '');
    const cpt = TYPE_TO_CPT[type];
    if (!cpt) {
      skipped.push(type);
      continue;
    }

    log.step(`importing metaobjects ${type} into CPT ${cpt}`);
    const content = fs.readFileSync(path.join(META_DIR, file), 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());

    let done = 0;
    let failed = 0;

    for (const line of lines) {
      const mo = JSON.parse(line) as ShopifyMetaobject;
      const slug = `${type}-${mo.handle}`;
      try {
        const existing = await wpFindBySlug<{ id: number }>(cpt, slug);
        const body: Record<string, unknown> = {
          title: mo.displayName || mo.handle,
          slug,
          status: 'publish',
          meta: {
            _shopify_metaobject_id: mo.id,
            _shopify_metaobject_type: mo.type,
            _shopify_metaobject_handle: mo.handle,
            _shopify_fields_json: JSON.stringify(mo.fields),
          },
        };
        const result = existing
          ? await wp<{ id: number }>(`/wp-json/wp/v2/${cpt}/${existing.id}`, { method: 'POST', body })
          : await wp<{ id: number }>(`/wp-json/wp/v2/${cpt}`, { method: 'POST', body });
        idMap[mo.id] = result.id;
        done++;
      } catch (e) {
        failed++;
        log.err(`  ${slug}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    log.ok(`  ${type} -> ${cpt}: ${done} ok, ${failed} failed`);
    totalDone += done;
    totalFailed += failed;
    fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
  }

  if (skipped.length) {
    log.warn(`skipped types without CPT mapping: ${skipped.join(', ')}`);
  }

  log.ok(`total metaobjects: ${totalDone} imported, ${totalFailed} failed`);
  markDone('import-metaobjects', totalDone);
}

main().catch((e) => {
  markFailed('import-metaobjects', e instanceof Error ? e.message : String(e));
  log.err('import-metaobjects failed', e);
  process.exit(1);
});
