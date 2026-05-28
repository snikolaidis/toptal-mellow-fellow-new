/**
 * Resume a bulk operation that started but lost connection.
 * Polls the current bulk operation on Shopify and downloads its result when complete.
 *
 * Usage: tsx migration/scripts/resume-bulk.ts <resource-name>
 * Example: tsx migration/scripts/resume-bulk.ts customers
 */

import { env } from './lib/env';
import { log } from './lib/logger';
import { ensureDirs, dataPath, countLines } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { getCurrentBulkOperation, waitForBulkOperation, downloadBulkResult } from './lib/shopify';

async function main() {
  const resource = process.argv[2];
  if (!resource) {
    log.err('Usage: tsx migration/scripts/resume-bulk.ts <resource-name>');
    process.exit(1);
  }
  ensureDirs();
  log.step(`resume bulk for ${resource}`);

  const current = await getCurrentBulkOperation();
  if (!current) {
    log.err('No current bulk operation on Shopify side. Did one ever run?');
    process.exit(1);
  }
  log.info(`found bulk ${current.id}, status ${current.status}, objectCount ${current.objectCount ?? '?'}`);

  markRunning(resource, { bulkOperationId: current.id });

  let op = current;
  if (op.status !== 'COMPLETED') {
    log.info('waiting for completion...');
    op = await waitForBulkOperation();
  }
  if (!op.url) {
    log.err('Bulk completed but has no URL (zero records?)');
    markFailed(resource, 'no url after completion');
    process.exit(1);
  }

  const outPath = dataPath(`${resource}.jsonl`);
  log.info(`downloading to ${outPath}`);
  try {
    const count = await downloadBulkResult(op.url, outPath);
    markDone(resource, count);
    log.ok(`${resource}: ${count} records written`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markFailed(resource, msg);
    log.err(`download failed: ${msg}`);
    process.exit(1);
  }
}

main().catch((e) => {
  log.err('resume failed', e);
  process.exit(1);
});
