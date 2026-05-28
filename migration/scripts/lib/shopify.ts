import { env } from './env';
import { log } from './logger';

const endpoint = `https://${env.shopify.domain}/admin/api/${env.shopify.apiVersion}/graphql.json`;
const restBase = `https://${env.shopify.domain}/admin/api/${env.shopify.apiVersion}`;
const tokenEndpoint = `https://${env.shopify.domain}/admin/oauth/access_token`;

export async function rest<T = unknown>(pathAndQuery: string): Promise<{ data: T; nextPageInfo: string | null }> {
  const token = await getAccessToken();
  const url = pathAndQuery.startsWith('http') ? pathAndQuery : `${restBase}${pathAndQuery}`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Shopify REST HTTP ${res.status}: ${await res.text()}`);
  }
  const linkHeader = res.headers.get('Link') || '';
  const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  const nextPageInfo = nextMatch ? nextMatch[1] : null;
  return { data: (await res.json()) as T, nextPageInfo };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  log.info('exchanging client credentials for access token...');
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.shopify.clientId,
      client_secret: env.shopify.clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number; scope?: string };
  if (!json.access_token) throw new Error('Token exchange returned no access_token');
  const ttlMs = ((json.expires_in || 86400) - 60) * 1000;
  cachedToken = { value: json.access_token, expiresAt: Date.now() + ttlMs };
  log.ok(`access token obtained, valid ~${Math.round(ttlMs / 1000 / 60)}m`);
  return cachedToken.value;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[]; extensions?: unknown }>;
  extensions?: { cost?: unknown };
}

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      const wait = Math.min(30000, 1000 * 2 ** (attempt - 1));
      log.warn(`fetch failed (attempt ${attempt}/${maxAttempts}), retry in ${wait}ms: ${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export async function gql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as GraphqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) {
    throw new Error('Shopify GraphQL returned no data');
  }
  return json.data;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface Connection<T> {
  edges: Array<{ node: T; cursor: string }>;
  pageInfo: PageInfo;
}

export async function* paginate<T>(
  query: string,
  variables: Record<string, unknown>,
  connectionPath: string,
  pageSize = 50
): AsyncGenerator<T> {
  let cursor: string | null = null;
  while (true) {
    const data = await gql<Record<string, unknown>>(query, {
      ...variables,
      first: pageSize,
      after: cursor,
    });
    const conn = getByPath<Connection<T>>(data, connectionPath);
    if (!conn) {
      throw new Error(`Connection not found at path "${connectionPath}"`);
    }
    for (const edge of conn.edges) {
      yield edge.node;
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
}

function getByPath<T>(obj: unknown, path: string): T | undefined {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj) as T | undefined;
}

interface BulkOperation {
  id: string;
  status: 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'CANCELING' | 'EXPIRED';
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  objectCount: string | null;
  fileSize: string | null;
  url: string | null;
  partialDataUrl: string | null;
}

export async function startBulkQuery(innerQuery: string): Promise<string> {
  const mutation = `
    mutation Run($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }
  `;
  type Resp = {
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: string } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
  const data = await gql<Resp>(mutation, { query: innerQuery });
  const errs = data.bulkOperationRunQuery.userErrors;
  if (errs?.length) {
    throw new Error(`Bulk start userErrors: ${JSON.stringify(errs)}`);
  }
  const op = data.bulkOperationRunQuery.bulkOperation;
  if (!op) throw new Error('Bulk start returned no operation');
  return op.id;
}

export async function getCurrentBulkOperation(): Promise<BulkOperation | null> {
  const q = `
    query Current {
      currentBulkOperation {
        id status errorCode createdAt completedAt objectCount fileSize url partialDataUrl
      }
    }
  `;
  const data = await gql<{ currentBulkOperation: BulkOperation | null }>(q);
  return data.currentBulkOperation;
}

export async function waitForBulkOperation(pollMs = 5000, maxMs = 60 * 60 * 1000): Promise<BulkOperation> {
  const startedAt = Date.now();
  while (true) {
    const op = await getCurrentBulkOperation();
    if (!op) throw new Error('No current bulk operation');
    if (op.status === 'COMPLETED') return op;
    if (op.status === 'FAILED' || op.status === 'CANCELED' || op.status === 'EXPIRED') {
      throw new Error(`Bulk operation ${op.status} (errorCode: ${op.errorCode})`);
    }
    if (Date.now() - startedAt > maxMs) {
      throw new Error(`Bulk operation timeout after ${maxMs}ms (current status: ${op.status})`);
    }
    log.info(`bulk ${op.status} objectCount=${op.objectCount ?? '?'}`);
    await sleep(pollMs);
  }
}

export async function downloadBulkResult(url: string, outPath: string): Promise<number> {
  const fs = await import('fs');
  const path = await import('path');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Bulk download HTTP ${res.status}`);
  }

  const fileStream = fs.createWriteStream(outPath);
  await new Promise<void>((resolve, reject) => {
    const reader = (res.body as unknown as ReadableStream<Uint8Array>).getReader();
    function pump(): void {
      reader.read().then(({ done, value }) => {
        if (done) {
          fileStream.end();
          resolve();
          return;
        }
        fileStream.write(Buffer.from(value));
        pump();
      }).catch(reject);
    }
    pump();
  });

  const content = fs.readFileSync(outPath, 'utf8');
  return content.split('\n').filter((l) => l.trim()).length;
}

export async function runBulkAndDownload(innerQuery: string, outPath: string): Promise<number> {
  log.info('starting bulk operation...');
  await cancelStaleBulkIfNeeded();
  await startBulkQuery(innerQuery);
  const op = await waitForBulkOperation();
  if (!op.url) {
    log.warn('bulk completed but no url returned (0 records?)');
    return 0;
  }
  log.info(`bulk completed, downloading from ${op.url.slice(0, 80)}...`);
  return downloadBulkResult(op.url, outPath);
}

async function cancelStaleBulkIfNeeded(): Promise<void> {
  const op = await getCurrentBulkOperation();
  if (!op) return;
  if (op.status === 'RUNNING' || op.status === 'CREATED') {
    log.warn(`canceling existing bulk operation ${op.id} (${op.status})...`);
    const mutation = `
      mutation Cancel($id: ID!) {
        bulkOperationCancel(id: $id) { bulkOperation { id status } userErrors { message } }
      }
    `;
    await gql(mutation, { id: op.id });
    while (true) {
      const cur = await getCurrentBulkOperation();
      if (!cur || cur.status === 'CANCELED' || cur.status === 'COMPLETED' || cur.status === 'FAILED') break;
      await sleep(2000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
