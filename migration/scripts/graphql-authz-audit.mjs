const TARGET = process.env.AUDIT_TARGET || 'http://localhost:3000/api/graphql';
const WP_GRAPHQL = process.env.AUDIT_WP_GRAPHQL || '';
const TOKEN_A = process.env.AUDIT_TOKEN_A || '';
const TOKEN_B = process.env.AUDIT_TOKEN_B || '';
const VICTIM_ORDER_DB_ID = Number(process.env.AUDIT_VICTIM_ORDER_ID || 0);
const VICTIM_ORDER_GLOBAL_ID = process.env.AUDIT_VICTIM_ORDER_GLOBAL_ID || '';
const VICTIM_CUSTOMER_DB_ID = Number(process.env.AUDIT_VICTIM_CUSTOMER_ID || 0);

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

let failures = 0;
let warnings = 0;

function log(msg) { process.stdout.write(msg + '\n'); }
function pass(msg) { log(`${GREEN}PASS${RESET} ${msg}`); }
function warn(msg) { warnings++; log(`${YELLOW}WARN${RESET} ${msg}`); }
function fail(msg) { failures++; log(`${RED}FAIL${RESET} ${msg}`); }
function section(msg) { log(`\n${BOLD}== ${msg} ==${RESET}`); }

async function gql(url, query, variables, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

function hasData(node) {
  if (node === null || node === undefined) return false;
  if (Array.isArray(node)) return node.some(hasData);
  if (typeof node === 'object') return Object.values(node).some(hasData);
  return true;
}

function errorText(json) {
  if (!json || !Array.isArray(json.errors)) return '';
  return json.errors.map((e) => e.message || '').join(' | ');
}

async function guestSweep() {
  section('1. GUEST (unauthenticated) PII / sensitive-field sweep');
  log(`target: ${TARGET}`);

  const products = await gql(TARGET, `
    query { products(first: 1) { nodes { databaseId name } } }
  `);
  if (products.json?.data?.products?.nodes?.length) {
    pass('products readable as guest (expected: catalog is public)');
  } else {
    warn('products returned no data as guest; check endpoint reachable. errors: ' + errorText(products.json));
  }

  const coupons = await gql(TARGET, `
    query { coupons(first: 5) { nodes { id code amount discountType } } }
  `);
  const couponNodes = coupons.json?.data?.coupons?.nodes || null;
  if (couponNodes && couponNodes.length && couponNodes.some((c) => c && c.code)) {
    fail(`coupons LEAKED to guest: ${couponNodes.length} coupon code(s) returned. WooGraphQL should require manage_options. codes=${couponNodes.map((c) => c.code).join(',')}`);
  } else if (errorText(coupons.json)) {
    pass('coupons blocked for guest (' + errorText(coupons.json).slice(0, 80) + ')');
  } else {
    pass('coupons returned null/empty for guest');
  }

  const orders = await gql(TARGET, `
    query { orders(first: 5) { nodes { id databaseId total status billing { email } } } }
  `);
  const orderNodes = orders.json?.data?.orders?.nodes || null;
  if (orderNodes && orderNodes.length && hasData(orderNodes)) {
    fail(`orders LEAKED to guest: ${orderNodes.length} order(s) with totals/emails returned.`);
  } else if (errorText(orders.json)) {
    pass('orders blocked for guest (' + errorText(orders.json).slice(0, 80) + ')');
  } else {
    pass('orders returned null/empty for guest');
  }

  const customer = await gql(TARGET, `
    query { customer { id databaseId email firstName lastName billing { address1 phone } } }
  `);
  const cust = customer.json?.data?.customer || null;
  if (cust && (cust.email || cust.databaseId || hasData(cust.billing))) {
    fail(`customer PII LEAKED to guest: ${JSON.stringify(cust).slice(0, 160)}`);
  } else {
    pass('customer returned no PII for guest (null/empty session customer)');
  }

  const customers = await gql(TARGET, `
    query { customers(first: 5) { nodes { databaseId email } } }
  `);
  const custList = customers.json?.data?.customers?.nodes || null;
  if (custList && custList.length && hasData(custList)) {
    fail(`customers list LEAKED to guest: ${custList.length} customer email(s) returned.`);
  } else if (errorText(customers.json)) {
    pass('customers list blocked for guest (' + errorText(customers.json).slice(0, 80) + ')');
  } else {
    pass('customers list returned null/empty for guest');
  }

  const sales = await gql(TARGET, `
    query { totalSales }
  `);
  if (sales.json?.data && sales.json.data.totalSales !== null && sales.json.data.totalSales !== undefined) {
    fail(`totalSales LEAKED to guest: ${sales.json.data.totalSales} (store revenue must require admin)`);
  } else if (errorText(sales.json)) {
    pass('totalSales blocked for guest (' + errorText(sales.json).slice(0, 80) + ')');
  } else {
    pass('totalSales returned null for guest');
  }

  const introspect = await gql(TARGET, `
    query { __schema { queryType { name } } }
  `);
  if (introspect.json?.data?.__schema) {
    warn('introspection enabled in this environment (acceptable in dev; disable in production hardening)');
  } else {
    pass('introspection disabled');
  }
}

async function idorCheck() {
  section('2. AUTHENTICATED IDOR check (customer A reads customer B order)');

  if (!WP_GRAPHQL || !TOKEN_A) {
    warn('IDOR check SKIPPED: set AUDIT_WP_GRAPHQL and AUDIT_TOKEN_A (see run steps). This half needs a real access token.');
    return;
  }
  log(`target: ${WP_GRAPHQL}`);

  const whoami = await gql(WP_GRAPHQL, `{ viewer { databaseId email } }`, null, TOKEN_A);
  const meId = whoami.json?.data?.viewer?.databaseId;
  if (!meId) {
    fail('TOKEN_A did not resolve to a viewer. Token invalid/expired. errors: ' + errorText(whoami.json));
    return;
  }
  pass(`authenticated as customer A databaseId=${meId} (${whoami.json.data.viewer.email})`);

  if (VICTIM_ORDER_DB_ID || VICTIM_ORDER_GLOBAL_ID) {
    const byDb = VICTIM_ORDER_DB_ID
      ? await gql(WP_GRAPHQL, `
          query($id: Int!) { order(id: $id, idType: DATABASE_ID) { databaseId total billing { email firstName lastName } } }
        `, { id: VICTIM_ORDER_DB_ID }, TOKEN_A)
      : { json: null };

    const byGlobal = VICTIM_ORDER_GLOBAL_ID
      ? await gql(WP_GRAPHQL, `
          query($id: ID!) { order(id: $id) { databaseId total billing { email firstName lastName } } }
        `, { id: VICTIM_ORDER_GLOBAL_ID }, TOKEN_A)
      : { json: null };

    for (const [label, r] of [['DATABASE_ID', byDb], ['global ID', byGlobal]]) {
      if (!r.json) continue;
      const order = r.json?.data?.order || null;
      if (order && hasData(order)) {
        fail(`IDOR (${label}): customer A READ customer B order ${VICTIM_ORDER_DB_ID || VICTIM_ORDER_GLOBAL_ID}: ${JSON.stringify(order).slice(0, 160)}`);
      } else if (errorText(r.json)) {
        pass(`IDOR (${label}): access denied by error (` + errorText(r.json).slice(0, 80) + ')');
      } else {
        pass(`IDOR (${label}): order returned null (WooGraphQL ownership check held)`);
      }
    }
  } else {
    warn('no victim order id provided (AUDIT_VICTIM_ORDER_ID / AUDIT_VICTIM_ORDER_GLOBAL_ID); skipping cross-order read');
  }

  if (VICTIM_CUSTOMER_DB_ID) {
    const cust = await gql(WP_GRAPHQL, `
      query($id: Int!) { customer(id: $id) { databaseId email billing { address1 phone } } }
    `, { id: VICTIM_CUSTOMER_DB_ID }, TOKEN_A);
    const c = cust.json?.data?.customer || null;
    if (c && (c.email || hasData(c.billing))) {
      fail(`IDOR: customer A read customer B profile ${VICTIM_CUSTOMER_DB_ID}: ${JSON.stringify(c).slice(0, 160)}`);
    } else if (errorText(cust.json)) {
      pass('IDOR customer(id): access denied by error (' + errorText(cust.json).slice(0, 80) + ')');
    } else {
      pass('IDOR customer(id): returned null for other customer');
    }
  }

  const ownOrders = await gql(WP_GRAPHQL, `
    { customer { databaseId orders(first: 3) { nodes { databaseId total } } } }
  `, null, TOKEN_A);
  const own = ownOrders.json?.data?.customer?.orders?.nodes || [];
  pass(`sanity: customer A can read own ${own.length} order(s) via customer.orders`);
}

async function main() {
  log(`${BOLD}GraphQL guest-vs-authenticated PII / IDOR audit${RESET}`);
  await guestSweep();
  await idorCheck();

  section('RESULT');
  log(`failures: ${failures}, warnings: ${warnings}`);
  if (failures > 0) {
    log(`${RED}${BOLD}AUDIT FAILED: sensitive data exposed or IDOR possible.${RESET}`);
    process.exit(1);
  }
  log(`${GREEN}${BOLD}AUDIT PASSED: no sensitive leak or IDOR detected in tested paths.${RESET}`);
  process.exit(0);
}

main().catch((e) => {
  fail('script error: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
