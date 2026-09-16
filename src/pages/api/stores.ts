import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

// Serves the store-locator dataset (~4k rows) as a light, edge-cached payload.
//
// Why an API route instead of shipping the stores in getStaticProps: inlined in
// the page they cost ~1.1MB of JSON in __NEXT_DATA__ that every visitor parses
// and hydrates on load. Here the browser fetches it once, gzipped and
// CDN-cached, so the page HTML stays tiny. The s-maxage below means the WP
// backend is hit at most once per window across all traffic (important with the
// small WP Engine worker pool), and stale-while-revalidate serves instantly
// while a single refresh runs in the background.

const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const STORES_ENDPOINT = `${WP_BASE}/wp-json/mellow-fellow/v1/stores`;

// 5 decimals of lat/lng is ~1.1m of precision — far more than a store pin needs,
// and it roughly halves the coordinate bytes across thousands of rows.
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

// Only the fields the locator UI actually reads. Dropping the unused ones
// (email, website, image, postCode) trims the payload further.
function trimStore(s: any) {
  return {
    id: s.id,
    name: s.name,
    lat: round5(Number(s.lat)),
    lng: round5(Number(s.lng)),
    address: s.address || '',
    city: s.city || '',
    state: s.state || '',
    country: s.country || '',
    phone: s.phone || '',
    hours: s.hours || '',
    categories: Array.isArray(s.categories) ? s.categories.filter(Boolean) : [],
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed', stores: [] });
  }

  try {
    const upstream = await fetch(STORES_ENDPOINT);
    if (!upstream.ok) {
      throw new Error(`stores request failed (${upstream.status})`);
    }
    const data = await upstream.json();
    const raw = Array.isArray(data?.stores) ? data.stores : [];

    const stores = raw
      // Drop rows with no usable coordinate — they cannot be mapped or sorted.
      .filter((s: any) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
      .map(trimStore);

    // The store list changes rarely; cache hard at the edge and keep serving the
    // last good copy while a background refresh runs.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');

    return res.status(200).json({ success: true, stores });
  } catch (error) {
    console.error('[Stores API] Fetch failed:', error);
    return res.status(502).json({ success: false, message: 'Stores unavailable', stores: [] });
  }
}

export default withRateLimitOnly(60, 60000)(handler);
