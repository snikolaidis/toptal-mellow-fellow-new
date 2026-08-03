import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { Meilisearch } from 'meilisearch';
import { withRateLimitOnly } from '@/lib/middleware';
import {
  buildIndexDefinitions,
  rebuildIndex,
  resolveTargets,
  type IndexResult,
} from '@/lib/reindex';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const MEILI_HOST = process.env.MEILISEARCH_HOST || '';
const MEILI_ADMIN_KEY = process.env.MEILISEARCH_ADMIN_KEY || '';
const REINDEX_SECRET = process.env.REINDEX_SECRET || '';

function isAuthorized(req: NextApiRequest): boolean {
  if (!REINDEX_SECRET) return false;
  const provided = req.headers['x-reindex-secret'];
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(REINDEX_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!WP_URL || !MEILI_HOST || !MEILI_ADMIN_KEY) {
    return res.status(503).json({ error: 'Reindex is not configured' });
  }

  const targets = resolveTargets(req.query.type, buildIndexDefinitions(WP_URL));
  if (!targets) {
    return res.status(400).json({ error: 'Unknown index type' });
  }

  const startedAt = Date.now();

  try {
    const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_ADMIN_KEY });

    const indexes = await client.getRawIndexes({ limit: 1000 });
    const existingUids = new Set(indexes.results.map((i) => i.uid));

    const results: Record<string, IndexResult> = {};
    for (const definition of targets) {
      results[definition.uid] = await rebuildIndex(client, definition, existingUids);
    }

    const entries = Object.values(results);

    return res.status(entries.every((r) => r.ok) ? 200 : 502).json({
      indexed: entries.reduce((sum, r) => sum + r.indexed, 0),
      deleted: entries.reduce((sum, r) => sum + r.deleted, 0),
      durationMs: Date.now() - startedAt,
      results,
    });
  } catch (error) {
    console.error('[Reindex] Failed:', (error as Error).message);
    return res.status(500).json({ error: 'Reindex failed' });
  }
}

export default withRateLimitOnly(5, 60000)(handler);
