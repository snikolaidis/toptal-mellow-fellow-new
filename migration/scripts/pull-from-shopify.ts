/**
 * Pulls all relevant Shopify data into local JSONL files under migration/data/.
 *
 * Large resources (products, customers, orders) use the Bulk Operations API.
 * Smaller resources use regular paginated GraphQL.
 *
 * Run: npm run migrate:pull
 *
 * Idempotent: each resource is tracked in migration/data/_state/<resource>.json.
 * Resources marked "done" are skipped on rerun. Delete the state file to force a re-pull.
 */

import { env } from './lib/env';
import { log } from './lib/logger';
import { ensureDirs, dataPath } from './lib/jsonl';
import { writeJsonlSync, countLines } from './lib/jsonl';
import { isDone, markRunning, markDone, markFailed } from './lib/state';
import { gql, paginate, runBulkAndDownload, rest } from './lib/shopify';

async function main() {
  log.step('Shopify pull starting');
  log.info(`store: ${env.shopify.domain}`);
  log.info(`apiVersion: ${env.shopify.apiVersion}`);
  ensureDirs();

  const resources: Array<{ name: string; fn: () => Promise<number> }> = [
    { name: 'shop', fn: pullShop },
    { name: 'locations', fn: pullLocations },
    { name: 'collections', fn: pullCollections },
    { name: 'metaobjects', fn: pullMetaobjects },
    { name: 'pages', fn: pullPages },
    { name: 'blog-articles', fn: pullBlogArticles },
    { name: 'redirects', fn: pullRedirects },
    { name: 'discounts', fn: pullDiscounts },
    { name: 'markets', fn: pullMarkets },
    { name: 'products', fn: pullProducts },
    { name: 'customers', fn: pullCustomers },
    { name: 'orders', fn: pullOrders },
  ];

  const force = process.argv.includes('--force');
  const stopOnError = process.argv.includes('--stop-on-error');
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');

  const failed: string[] = [];
  for (const r of resources) {
    if (only && !only.includes(r.name)) continue;
    if (!force && isDone(r.name)) {
      log.info(`skip ${r.name} (already done, use --force to re-pull)`);
      continue;
    }
    log.step(`pulling ${r.name}`);
    markRunning(r.name);
    try {
      const count = await r.fn();
      markDone(r.name, count);
      log.ok(`${r.name}: ${count} records`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      markFailed(r.name, msg);
      log.err(`${r.name} failed: ${msg.slice(0, 200)}`);
      failed.push(r.name);
      if (stopOnError) throw e;
    }
  }

  log.step('Shopify pull complete');
  if (failed.length) {
    log.warn(`failed resources: ${failed.join(', ')}`);
    log.warn('check migration/data/_state/<name>.json for details');
  }
}

async function pullShop(): Promise<number> {
  const data = await gql<{ shop: unknown }>(`
    query Shop {
      shop {
        id name email myshopifyDomain primaryDomain { url host }
        currencyCode timezoneOffset weightUnit ianaTimezone
        billingAddress { address1 address2 city province country zip phone }
        contactEmail
      }
    }
  `);
  writeJsonlSync(dataPath('shop.json'), [data.shop]);
  return 1;
}

async function pullLocations(): Promise<number> {
  const data = await gql<{ locations: { edges: Array<{ node: unknown }> } }>(`
    query Locations { locations(first: 50) { edges { node {
      id name isActive shipsInventory
      address { address1 address2 city province country countryCode zip phone }
    } } } }
  `);
  const records = data.locations.edges.map((e) => e.node);
  writeJsonlSync(dataPath('locations.jsonl'), records);
  return records.length;
}

async function pullCollections(): Promise<number> {
  const query = `
    query Collections($first: Int!, $after: String) {
      collections(first: $first, after: $after, sortKey: ID) {
        edges {
          cursor
          node {
            id handle title descriptionHtml sortOrder updatedAt
            seo { title description }
            image { url altText width height }
            ruleSet { rules { column relation condition } appliedDisjunctively }
            productsCount { count }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: unknown[] = [];
  for await (const node of paginate(query, {}, 'collections', 50)) {
    out.push(node);
  }
  writeJsonlSync(dataPath('collections.jsonl'), out);
  return out.length;
}

async function pullMetaobjects(): Promise<number> {
  const defsQuery = `
    query Defs { metaobjectDefinitions(first: 100) { edges { node { id type name } } } }
  `;
  const defs = await gql<{ metaobjectDefinitions: { edges: Array<{ node: { id: string; type: string; name: string } }> } }>(defsQuery);
  let total = 0;
  for (const e of defs.metaobjectDefinitions.edges) {
    const def = e.node;
    const query = `
      query MO($type: String!, $first: Int!, $after: String) {
        metaobjects(type: $type, first: $first, after: $after) {
          edges {
            cursor
            node {
              id type handle displayName updatedAt
              fields { key value type reference { ... on MediaImage { id image { url altText } } } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    const out: unknown[] = [];
    for await (const node of paginate(query, { type: def.type }, 'metaobjects', 50)) {
      out.push(node);
    }
    writeJsonlSync(dataPath(`metaobjects/${def.type}.jsonl`), out);
    log.info(`  metaobject ${def.type}: ${out.length}`);
    total += out.length;
  }
  return total;
}

async function pullPages(): Promise<number> {
  const query = `
    query Pages($first: Int!, $after: String) {
      pages(first: $first, after: $after) {
        edges {
          cursor
          node {
            id title handle body bodySummary isPublished publishedAt createdAt updatedAt
            templateSuffix
            metafields(first: 50) { edges { node { namespace key value type } } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: unknown[] = [];
  for await (const node of paginate(query, {}, 'pages', 50)) {
    out.push(node);
  }
  writeJsonlSync(dataPath('pages.jsonl'), out);
  return out.length;
}

async function pullBlogArticles(): Promise<number> {
  const blogsQuery = `query Blogs { blogs(first: 50) { edges { node { id title handle } } } }`;
  const blogs = await gql<{ blogs: { edges: Array<{ node: { id: string; title: string; handle: string } }> } }>(blogsQuery);
  let total = 0;
  for (const e of blogs.blogs.edges) {
    const blog = e.node;
    const query = `
      query Articles($blogId: ID!, $first: Int!, $after: String) {
        blog(id: $blogId) {
          articles(first: $first, after: $after) {
            edges {
              cursor
              node {
                id title handle body author { name } image { url altText }
                tags publishedAt updatedAt isPublished
                metafields(first: 20) { edges { node { namespace key value type } } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `;
    const out: unknown[] = [];
    for await (const node of paginate(query, { blogId: blog.id }, 'blog.articles', 50)) {
      out.push({ ...(node as object), _blogHandle: blog.handle });
    }
    writeJsonlSync(dataPath(`blog-articles/${blog.handle}.jsonl`), out);
    log.info(`  blog ${blog.handle}: ${out.length} articles`);
    total += out.length;
  }
  return total;
}

async function pullRedirects(): Promise<number> {
  // GraphQL urlRedirects requires a scope not granted via the standard scope list,
  // so we use the REST endpoint which works with read_content.
  const all: unknown[] = [];
  let next: string | null = '/redirects.json?limit=250';
  while (next) {
    const result: { data: { redirects: unknown[] }; nextPageInfo: string | null } = await rest<{ redirects: unknown[] }>(next);
    all.push(...result.data.redirects);
    next = result.nextPageInfo;
  }
  writeJsonlSync(dataPath('redirects.jsonl'), all);
  return all.length;
}

async function pullDiscounts(): Promise<number> {
  // Simple query with just __typename and common fields. Detailed code lists per discount
  // can be fetched in a follow up if the import script needs them.
  const query = `
    query Discounts($first: Int!, $after: String) {
      discountNodes(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            discount {
              __typename
              ... on DiscountCodeBasic {
                title summary status startsAt endsAt usageLimit
                codes(first: 1) { edges { node { code } } pageInfo { hasNextPage } }
              }
              ... on DiscountAutomaticBasic { title summary status startsAt endsAt }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const out: unknown[] = [];
  for await (const node of paginate(query, {}, 'discountNodes', 25)) {
    out.push(node);
  }
  writeJsonlSync(dataPath('discounts.jsonl'), out);
  return out.length;
}

async function pullMarkets(): Promise<number> {
  const data = await gql<{ markets: { edges: Array<{ node: unknown }> } }>(`
    query Markets {
      markets(first: 50) {
        edges { node {
          id name handle enabled
          regions(first: 50) { edges { node { ... on MarketRegionCountry { code name } } } }
        } }
      }
    }
  `);
  const records = data.markets.edges.map((e) => e.node);
  writeJsonlSync(dataPath('markets.jsonl'), records);
  return records.length;
}

async function pullProducts(): Promise<number> {
  const innerQuery = `
    {
      products {
        edges {
          node {
            id handle title descriptionHtml vendor productType status tags
            createdAt updatedAt publishedAt onlineStoreUrl onlineStorePreviewUrl
            seo { title description }
            options { name values position }
            metafields { edges { node { namespace key value type } } }
            variants {
              edges {
                node {
                  id title sku barcode price compareAtPrice
                  inventoryQuantity inventoryPolicy taxable
                  selectedOptions { name value }
                  inventoryItem { id tracked measurement { weight { value unit } } }
                  metafields { edges { node { namespace key value type } } }
                }
              }
            }
            media {
              edges {
                node {
                  __typename
                  ... on MediaImage { id image { url altText width height } }
                  ... on Video { id sources { url mimeType } }
                }
              }
            }
          }
        }
      }
    }
  `;
  return runBulkAndDownload(innerQuery, dataPath('products.jsonl'));
}

async function pullCustomers(): Promise<number> {
  const innerQuery = `
    {
      customers {
        edges {
          node {
            id firstName lastName email phone state numberOfOrders amountSpent { amount currencyCode }
            verifiedEmail tags note createdAt updatedAt
            defaultAddress { id firstName lastName address1 address2 city province provinceCode country countryCodeV2 zip phone }
            addresses { id firstName lastName address1 address2 city province provinceCode country countryCodeV2 zip phone }
            emailMarketingConsent { marketingState marketingOptInLevel }
            smsMarketingConsent { marketingState marketingOptInLevel }
            metafields { edges { node { namespace key value type } } }
          }
        }
      }
    }
  `;
  return runBulkAndDownload(innerQuery, dataPath('customers.jsonl'));
}

async function pullOrders(): Promise<number> {
  const innerQuery = `
    {
      orders {
        edges {
          node {
            id name email phone createdAt updatedAt processedAt cancelledAt cancelReason
            displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            currencyCode tags note
            customer { id email }
            shippingAddress { firstName lastName address1 address2 city province provinceCode country countryCodeV2 zip phone }
            billingAddress { firstName lastName address1 address2 city province provinceCode country countryCodeV2 zip phone }
            lineItems {
              edges {
                node {
                  id title quantity sku vendor
                  variant { id sku }
                  originalUnitPriceSet { shopMoney { amount currencyCode } }
                  discountedUnitPriceSet { shopMoney { amount currencyCode } }
                }
              }
            }
            fulfillments {
              id status createdAt updatedAt trackingInfo { number url company }
            }
            refunds {
              id createdAt totalRefundedSet { shopMoney { amount currencyCode } }
            }
            metafields { edges { node { namespace key value type } } }
          }
        }
      }
    }
  `;
  return runBulkAndDownload(innerQuery, dataPath('orders.jsonl'));
}

main().catch((e) => {
  log.err('pull failed', e);
  process.exit(1);
});
