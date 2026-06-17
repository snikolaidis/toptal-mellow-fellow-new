import { readFileSync } from 'node:fs';

const GUID = process.env.YOTPO_LOYALTY_GUID || 'AJUs08zwC9wlMRyimafHsw';
const API_KEY = process.env.YOTPO_LOYALTY_API_KEY;
const BASE = 'https://loyalty.yotpo.com/api/v2';

function usage() {
  console.error('Backup Yotpo loyalty balances to CSV (one row per email).');
  console.error('');
  console.error('Usage:');
  console.error('  YOTPO_LOYALTY_API_KEY=<loyalty_api_key> node migration/scripts/export-yotpo-loyalty.mjs <emails-file> > backup.csv');
  console.error('');
  console.error('  <emails-file>: a text/CSV file with one customer email per line (header line "email" optional).');
  console.error('  Get the email list from your Woo/Shopify customer export.');
}

if (!API_KEY) {
  console.error('ERROR: set YOTPO_LOYALTY_API_KEY in the environment (the LOYALTY api key, not the Reviews secret).');
  usage();
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('ERROR: missing <emails-file> argument.');
  usage();
  process.exit(1);
}

const emails = readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && l.includes('@'));

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function fetchCustomer(email) {
  const url = `${BASE}/customers?customer_email=${encodeURIComponent(email)}&guid=${GUID}&api_key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(['email', 'points_balance', 'points_earned', 'vip_tier_name', 'total_spend_cents', 'total_purchases'].join(','));

let ok = 0;
let missing = 0;
for (const email of emails) {
  const c = await fetchCustomer(email);
  if (!c || typeof c !== 'object' || c.error) {
    missing += 1;
    console.log([csvCell(email), '', '', '', '', ''].join(','));
  } else {
    ok += 1;
    console.log(
      [
        csvCell(email),
        csvCell(c.points_balance),
        csvCell(c.points_earned),
        csvCell(c.vip_tier_name),
        csvCell(c.total_spend_cents),
        csvCell(c.total_purchases),
      ].join(',')
    );
  }
  await sleep(120);
}

console.error(`Done. ${ok} found, ${missing} not found, ${emails.length} total.`);
