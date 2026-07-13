import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  postcode: string;
  countryCode: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, suggestions: [] });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 3) {
    return res.status(200).json({ success: true, suggestions: [] });
  }

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en`;
    const response = await fetch(url, { headers: { 'User-Agent': 'MellowFellow-Checkout' } });
    if (!response.ok) {
      throw new Error('photon request failed');
    }

    const data = await response.json();
    const seen = new Set<string>();
    const suggestions: AddressSuggestion[] = [];

    for (const feature of data?.features || []) {
      const p = feature?.properties || {};
      if (p.countrycode !== 'US') continue;
      if (!p.street && !p.housenumber) continue;

      const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(' ').trim();
      if (!line1) continue;

      const city = p.city || p.town || p.village || p.county || '';
      const label = [line1, city, p.state, p.postcode].filter(Boolean).join(', ');
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      suggestions.push({
        id: `${p.osm_type || ''}${p.osm_id || key}`,
        label,
        line1,
        city,
        state: p.state || '',
        postcode: p.postcode || '',
        countryCode: p.countrycode || 'US',
      });

      if (suggestions.length >= 5) break;
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, suggestions });
  } catch {
    console.error('[Address Autocomplete] Photon query failed');
    return res.status(200).json({ success: true, suggestions: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
