/**
 * Imports redirects from migration/data/redirects.jsonl into the Redirection plugin.
 * Uses the Redirection REST API at /wp-json/redirection/v1/.
 *
 * Run: npm run migrate:redirects
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wp } from './lib/wp';

const REDIRECTS_FILE = path.join(DATA_DIR, 'redirects.jsonl');

interface ShopifyRedirect {
  id: number | string;
  path: string;
  target: string;
}

async function main() {
  ensureDirs();
  markRunning('import-redirects');

  if (!fs.existsSync(REDIRECTS_FILE)) {
    markFailed('import-redirects', 'redirects.jsonl missing');
    process.exit(1);
  }

  const lines = fs.readFileSync(REDIRECTS_FILE, 'utf8').split('\n').filter((l) => l.trim());
  log.step(`importing ${lines.length} redirects`);

  let done = 0;
  let failed = 0;
  let skipped = 0;

  for (const line of lines) {
    const r = JSON.parse(line) as ShopifyRedirect;
    if (!r.path || !r.target) {
      skipped++;
      continue;
    }
    try {
      await wp('/wp-json/redirection/v1/redirect', {
        method: 'POST',
        body: {
          url: r.path,
          action_data: { url: r.target },
          match_type: 'url',
          action_type: 'url',
          action_code: 301,
          group_id: 1,
          enabled: true,
        },
      });
      done++;
      if (done % 100 === 0) log.info(`progress ${done}/${lines.length}`);
    } catch (e) {
      failed++;
      if (failed <= 5) log.err(`  ${r.path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log.ok(`redirects: ${done} imported, ${failed} failed, ${skipped} skipped`);
  markDone('import-redirects', done);
}

main().catch((e) => {
  markFailed('import-redirects', e instanceof Error ? e.message : String(e));
  log.err('import-redirects failed', e);
  process.exit(1);
});
