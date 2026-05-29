/**
 * Imports customers from migration/data/customers.jsonl into WooCommerce.
 *
 * Bulk JSONL structure: parent Customer records + child MailingAddress + child Metafield records
 * grouped by __parentId. We rebuild the customer object, then upsert into Woo by email.
 *
 * Passwords do not transfer. Customers will need to reset on first login.
 *
 * Run: npm run migrate:customers
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wc } from './lib/woo';

const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.jsonl');
const MAP_FILE = path.join(DATA_DIR, '_maps', 'customers.json');

interface RawRecord {
  id?: string;
  __parentId?: string;
  __typename?: string;
  [key: string]: unknown;
}

interface GroupedCustomer {
  raw: RawRecord;
  addresses: RawRecord[];
  metafields: RawRecord[];
}

function groupCustomers(file: string): GroupedCustomer[] {
  const map = new Map<string, GroupedCustomer>();
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as RawRecord;
    const gid = String(rec.id || '');
    const parent = rec.__parentId;
    if (gid.includes('/Customer/') && !parent) {
      map.set(gid, { raw: rec, addresses: [], metafields: [] });
    } else if (parent) {
      const c = map.get(parent);
      if (!c) continue;
      if (gid.includes('/MailingAddress/') || rec.__typename === 'MailingAddress') c.addresses.push(rec);
      else if (rec.namespace && rec.key) c.metafields.push(rec);
    }
  }
  return Array.from(map.values());
}

function buildAddress(a: RawRecord | undefined): Record<string, string> {
  if (!a) return {};
  return {
    first_name: String(a.firstName || ''),
    last_name: String(a.lastName || ''),
    address_1: String(a.address1 || ''),
    address_2: String(a.address2 || ''),
    city: String(a.city || ''),
    state: String(a.provinceCode || a.province || ''),
    postcode: String(a.zip || ''),
    country: String(a.countryCodeV2 || a.country || ''),
    phone: String(a.phone || ''),
  };
}

async function findCustomerByEmail(email: string): Promise<{ id: number } | null> {
  const list = await wc<Array<{ id: number }>>('/customers', { query: { email, per_page: 1 } });
  return list[0] || null;
}

async function main() {
  ensureDirs();
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  markRunning('import-customers');

  if (!fs.existsSync(CUSTOMERS_FILE)) {
    markFailed('import-customers', 'customers.jsonl missing');
    process.exit(1);
  }

  const idMap: Record<string, number> = fs.existsSync(MAP_FILE)
    ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
    : {};

  log.step('grouping bulk records by customer');
  let customers = groupCustomers(CUSTOMERS_FILE);
  log.info(`grouped ${customers.length} customers`);

  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  if (limitArg) {
    const limit = parseInt(limitArg, 10);
    customers = customers.slice(0, limit);
    log.info(`limited to ${customers.length} customers`);
  }

  let done = 0;
  let failed = 0;
  let skipped = 0;

  for (const c of customers) {
    const r = c.raw;
    const shopifyId = String(r.id || '');
    if (idMap[shopifyId]) {
      skipped++;
      continue;
    }
    const email = String(r.email || '').trim();
    if (!email) {
      skipped++;
      continue;
    }
    try {
      const existing = await findCustomerByEmail(email);
      const defaultAddr = c.addresses[0];
      const payload = {
        email,
        first_name: String(r.firstName || ''),
        last_name: String(r.lastName || ''),
        username: email,
        password: crypto.randomBytes(16).toString('hex'),
        billing: buildAddress(defaultAddr),
        shipping: buildAddress(defaultAddr),
        meta_data: [
          { key: '_shopify_id', value: shopifyId },
          { key: '_shopify_state', value: String(r.state || '') },
          { key: '_shopify_tags', value: String(r.tags || '') },
          { key: '_shopify_note', value: String(r.note || '') },
        ],
      };
      const result = existing
        ? await wc<{ id: number }>(`/customers/${existing.id}`, { method: 'PUT', body: payload })
        : await wc<{ id: number }>('/customers', { method: 'POST', body: payload });
      idMap[shopifyId] = result.id;
      done++;
      if (done % 100 === 0) {
        log.info(`progress ${done}/${customers.length}`);
        fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
      }
    } catch (e) {
      failed++;
      if (failed <= 10) log.err(`customer ${email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2));
  log.ok(`customers: ${done} imported, ${skipped} skipped, ${failed} failed`);
  markDone('import-customers', done);
}

main().catch((e) => {
  markFailed('import-customers', e instanceof Error ? e.message : String(e));
  log.err('import-customers failed', e);
  process.exit(1);
});
