import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

// Turns a free-text location ("Austin TX", "78701", "Main St, Denver") into a
// single lat/lng so the store locator can sort stores by distance and recenter.
//
// Uses Google Places Text Search, which stays on the SAME Places API the
// checkout autocomplete already uses (GOOGLE_MAPS_API_KEY, server-side only) —
// so this needs no extra Google API enabled and never exposes the key.

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed', result: null });
  }

  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Query must be at least 2 characters', result: null });
  }

  if (!GOOGLE_KEY) {
    return res.status(503).json({ success: false, message: 'Geocoding is not configured', result: null });
  }

  const query = q.trim().slice(0, 200);

  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}` +
      `&region=us&key=${GOOGLE_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`places textsearch request failed (${response.status})`);
    }

    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`places textsearch status ${data.status}`);
    }

    const top = (data.results || [])[0];
    const loc = top?.geometry?.location;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      // Not an error — the query just did not resolve to a place.
      return res.status(200).json({ success: true, result: null });
    }

    // A resolved place is stable, so cache hard at the edge.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

    return res.status(200).json({
      success: true,
      result: {
        lat: loc.lat,
        lng: loc.lng,
        label: top.formatted_address || top.name || query,
      },
    });
  } catch (error) {
    console.error('[Geocode API] Query failed:', error);
    return res.status(500).json({ success: false, message: 'Geocode failed', result: null });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
