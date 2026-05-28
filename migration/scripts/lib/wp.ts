import { env } from './env';

const base = env.wp.url.replace(/\/$/, '');
const authHeader = 'Basic ' + Buffer.from(`${env.wp.user}:${env.wp.appPassword}`).toString('base64');

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      const wait = Math.min(30000, 1000 * 2 ** (attempt - 1));
      console.warn(`wp fetch failed (attempt ${attempt}/${maxAttempts}): ${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export interface WpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean>;
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

export async function wp<T = unknown>(path: string, opts: WpRequestOptions = {}): Promise<T> {
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
    throw new Error(`WP ${init.method} ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

export async function wpUploadMedia(opts: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  altText?: string;
  caption?: string;
}): Promise<{ id: number; source_url: string; media_details?: unknown }> {
  const url = `${base}/wp-json/wp/v2/media`;
  const headers: Record<string, string> = {
    Authorization: authHeader,
    'Content-Disposition': `attachment; filename="${opts.filename.replace(/"/g, '')}"`,
    'Content-Type': opts.mimeType,
  };
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: opts.buffer as unknown as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WP media upload HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const media = (await res.json()) as { id: number; source_url: string };
  if (opts.altText || opts.caption) {
    await wp(`/wp-json/wp/v2/media/${media.id}`, {
      method: 'POST',
      body: {
        alt_text: opts.altText || '',
        caption: opts.caption || '',
      },
    });
  }
  return media;
}

export async function wpCreatePost<T = { id: number; slug: string }>(
  postType: string,
  data: Record<string, unknown>
): Promise<T> {
  return wp<T>(`/wp-json/wp/v2/${postType}`, { method: 'POST', body: data });
}

export async function wpUpdatePost<T = { id: number; slug: string }>(
  postType: string,
  id: number,
  data: Record<string, unknown>
): Promise<T> {
  return wp<T>(`/wp-json/wp/v2/${postType}/${id}`, { method: 'POST', body: data });
}

export async function wpFindBySlug<T = { id: number }>(
  postType: string,
  slug: string
): Promise<T | null> {
  const list = await wp<T[]>(`/wp-json/wp/v2/${postType}`, {
    query: { slug, per_page: 1, status: 'any' },
  });
  return list[0] || null;
}

export async function wpSetAcf(postType: string, id: number, fields: Record<string, unknown>): Promise<void> {
  await wp(`/wp-json/wp/v2/${postType}/${id}`, {
    method: 'POST',
    body: { acf: fields },
  });
}
