import { env } from './env';

const base = env.wc.url.replace(/\/$/, '');
const authHeader = 'Basic ' + Buffer.from(`${env.wc.key}:${env.wc.secret}`).toString('base64');

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      const wait = Math.min(30000, 1000 * 2 ** (attempt - 1));
      console.warn(`wc fetch failed (attempt ${attempt}/${maxAttempts}): ${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean>): string {
  const url = new URL(path.startsWith('http') ? path : `${base}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export interface WcRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean>;
}

export async function wc<T = unknown>(path: string, opts: WcRequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const init: RequestInit = {
    method: opts.method || 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  };
  const res = await fetchWithRetry(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WC ${init.method} ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

export async function wcFindBySlug<T extends { id: number }>(
  resource: 'products' | 'products/categories' | 'products/tags',
  slug: string
): Promise<T | null> {
  const list = await wc<T[]>(`/${resource}`, { query: { slug, per_page: 1 } });
  return list[0] || null;
}

export async function wcUpsertCategory(opts: {
  slug: string;
  name: string;
  description?: string;
  parent?: number;
  image?: { src: string };
  display?: 'default' | 'products' | 'subcategories' | 'both';
}): Promise<{ id: number; slug: string; name: string }> {
  const existing = await wcFindBySlug<{ id: number; slug: string; name: string }>('products/categories', opts.slug);
  if (existing) {
    return wc('/products/categories/' + existing.id, { method: 'PUT', body: opts });
  }
  return wc('/products/categories', { method: 'POST', body: opts });
}

export async function wcUpsertProduct(opts: Record<string, unknown> & { slug: string }): Promise<{
  id: number;
  slug: string;
}> {
  const existing = await wcFindBySlug<{ id: number; slug: string }>('products', opts.slug);
  if (existing) {
    return wc('/products/' + existing.id, { method: 'PUT', body: opts });
  }
  return wc('/products', { method: 'POST', body: opts });
}

export async function wcBatch<T = unknown>(
  resource: 'products' | 'products/categories' | 'products/tags',
  body: { create?: unknown[]; update?: unknown[]; delete?: number[] }
): Promise<T> {
  return wc(`/${resource}/batch`, { method: 'POST', body });
}
