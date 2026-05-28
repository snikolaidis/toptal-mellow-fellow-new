/**
 * Imports orders from migration/data/orders.jsonl into WooCommerce.
 *
 * Groups bulk JSONL: parent Order + child LineItem, Fulfillment, Refund, Metafield.
 * Matches Shopify customer to Woo customer via _maps/customers.json.
 * Creates orders with full address, line items, status, totals, and metadata.
 *
 * Run: npm run migrate:orders
 */

import fs from 'fs';
import path from 'path';
import { log } from './lib/logger';
import { ensureDirs, DATA_DIR } from './lib/jsonl';
import { markRunning, markDone, markFailed } from './lib/state';
import { wc } from './lib/woo';

const ORDERS_FILE = path.join(DATA_DIR, 'orders.jsonl');
const CUSTOMERS_MAP = path.join(DATA_DIR, '_maps', 'customers.json');
const PRODUCTS_MAP = path.join(DATA_DIR, '_maps', 'products.json');
const MAP_FILE = path.join(DATA_DIR, '_maps', 'orders.json');

interface RawRecord {
  id?: string;
  __parentId?: string;
  __typename?: string;
  [key: string]: unknown;
}

interface GroupedOrder {
  raw: RawRecord;
  lineItems: RawRecord[];
  fulfillments: RawRecord[];
  refunds: RawRecord[];
  metafields: RawRecord[];
}

function groupOrders(file: string): GroupedOrder[] {
  const map = new Map<string, GroupedOrder>();
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as RawRecord;
    const gid = String(rec.id || '');
    const parent = rec.__parentId;
    if (gid.includes('/Order/') && !parent) {
      map.set(gid, { raw: rec, lineItems: [], fulfillments: [], refunds: [], metafields: [] });
    } else if (parent) {
      const o = map.get(parent);
      if (!o) continue;
      if (gid.includes('/LineItem/')) o.lineItems.push(rec);
      else if (gid.includes('/Fulfillment/')) o.fulfillments.push(rec);
      else if (gid.includes('/Refund/')) o.refunds.push(rec);
      else if (rec.namespace && rec.key) o.metafields.push(rec);
    }
  }
  return Array.from(map.values());
}

function buildAddress(a: unknown): Record<string, string> {
  if (!a || typeof a !== 'object') return {};
  const addr = a as Record<string, unknown>;
  return {
    first_name: String(addr.firstName || ''),
    last_name: String(addr.lastName || ''),
    address_1: String(addr.address1 || ''),
    address_2: String(addr.address2 || ''),
    city: String(addr.city || ''),
    state: String(addr.provinceCode || addr.province || ''),
    postcode: String(addr.zip || ''),
    country: String(addr.countryCodeV2 || addr.country || ''),
    phone: String(addr.phone || ''),
  };
}

function shopifyFinancialToWc(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'paid') return 'completed';
  if (s === 'pending') return 'pending';
  if (s === 'authorized') return 'on-hold';
  if (s === 'refunded') return 'refunded';
  if (s === 'partially_refunded') return 'refunded';
  if (s === 'voided' || s === 'cancelled') return 'cancelled';
  return 'processing';
}

function money(set: unknown): string {
  if (!set || typeof set !== 'object') return '0';
  const m = (set as Record<string, unknown>).shopMoney;
  if (!m || typeof m !== 'object') return '0';
  return String((m as Record<string, unknown>).amount || '0');
}

async function main() {
  ensureDirs();
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  markRunning('import-orders');

  if (!fs.existsSync(ORDERS_FILE)) {
    markFailed('import-orders', 'orders.jsonl missing');
    process.exit(1);
  }

  const customersMap: Record<string, number> = fs.existsSync(CUSTOMERS_MAP)
    ? JSON.parse(fs.readFileSync(CUSTOMERS_MAP, 'utf8'))
    : {};
  const productsMap: Record<string, number> = fs.existsSync(PRODUCTS_MAP)
    ? JSON.parse(fs.readFileSync(PRODUCTS_MAP, 'utf8'))
    : {};
  const ordersMap: Record<string, number> = fs.existsSync(MAP_FILE)
    ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
    : {};

  log.step('grouping bulk records by order');
  let orders = groupOrders(ORDERS_FILE);
  log.info(`grouped ${orders.length} orders`);

  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  if (limitArg) {
    const limit = parseInt(limitArg, 10);
    orders.sort((a, b) => String(b.raw.createdAt || '').localeCompare(String(a.raw.createdAt || '')));
    orders = orders.slice(0, limit);
    log.info(`limited to ${orders.length} most recent orders`);
  }

  let done = 0;
  let failed = 0;
  let skipped = 0;

  for (const o of orders) {
    const r = o.raw;
    const shopifyId = String(r.id || '');
    if (ordersMap[shopifyId]) {
      skipped++;
      continue;
    }
    try {
      const customerId = customersMap[String((r.customer as { id?: string })?.id || '')] || 0;

      const lineItems = o.lineItems.map((li) => {
        const variant = li.variant as { id?: string; sku?: string } | undefined;
        const productGid = variant?.id ? variant.id.replace('/ProductVariant/', '/Product/').replace(/\/\d+$/, '') : '';
        const productId = productGid ? productsMap[productGid] : 0;
        return {
          product_id: productId || 0,
          name: String(li.title || ''),
          quantity: Number(li.quantity || 1),
          subtotal: money(li.originalUnitPriceSet),
          total: money(li.discountedUnitPriceSet || li.originalUnitPriceSet),
          sku: String(variant?.sku || li.sku || ''),
        };
      });

      const payload: Record<string, unknown> = {
        status: shopifyFinancialToWc(String(r.displayFinancialStatus || '')),
        customer_id: customerId,
        currency: String(r.currencyCode || 'USD'),
        date_created: String(r.createdAt || new Date().toISOString()),
        billing: buildAddress(r.billingAddress),
        shipping: buildAddress(r.shippingAddress),
        line_items: lineItems,
        meta_data: [
          { key: '_shopify_id', value: shopifyId },
          { key: '_shopify_name', value: String(r.name || '') },
          { key: '_shopify_tags', value: String(r.tags || '') },
          { key: '_shopify_note', value: String(r.note || '') },
        ],
      };

      const result = await wc<{ id: number }>('/orders', { method: 'POST', body: payload });
      ordersMap[shopifyId] = result.id;
      done++;
      if (done % 100 === 0) {
        log.info(`progress ${done}/${orders.length}`);
        fs.writeFileSync(MAP_FILE, JSON.stringify(ordersMap, null, 2));
      }
    } catch (e) {
      failed++;
      if (failed <= 10) log.err(`order ${r.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(ordersMap, null, 2));
  log.ok(`orders: ${done} imported, ${skipped} skipped, ${failed} failed`);
  markDone('import-orders', done);
}

main().catch((e) => {
  markFailed('import-orders', e instanceof Error ? e.message : String(e));
  log.err('import-orders failed', e);
  process.exit(1);
});
