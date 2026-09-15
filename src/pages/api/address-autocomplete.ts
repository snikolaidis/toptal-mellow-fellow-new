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

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function googlePredictions(q: string): Promise<AddressSuggestion[]> {
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=address&components=country:us&key=${GOOGLE_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('google autocomplete request failed');
  }
  const data = await response.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`google autocomplete status ${data.status}`);
  }
  // Predictions carry only a place_id and description; the structured address
  // is filled in on selection via a Place Details lookup (placeId branch below).
  return (data.predictions || []).slice(0, 5).map((p: { place_id: string; description: string }) => ({
    id: p.place_id,
    label: p.description,
    line1: '',
    city: '',
    state: '',
    postcode: '',
    countryCode: 'US',
  }));
}

async function googleDetails(placeId: string): Promise<AddressSuggestion | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_component,formatted_address&key=${GOOGLE_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('google details request failed');
  }
  const data = await response.json();
  if (data.status !== 'OK') {
    throw new Error(`google details status ${data.status}`);
  }
  const comps: { types: string[]; long_name: string; short_name: string }[] =
    data.result?.address_components || [];
  const get = (type: string, short = false) => {
    const c = comps.find((x) => x.types.includes(type));
    return c ? (short ? c.short_name : c.long_name) : '';
  };
  const line1 = [get('street_number'), get('route')].filter(Boolean).join(' ').trim();
  const city =
    get('locality') || get('sublocality') || get('postal_town') || get('administrative_area_level_2');
  return {
    id: placeId,
    label: data.result?.formatted_address || line1,
    line1,
    city,
    state: get('administrative_area_level_1'),
    postcode: get('postal_code'),
    countryCode: get('country', true) || 'US',
  };
}

async function photonPredictions(q: string): Promise<AddressSuggestion[]> {
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
  return suggestions;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, suggestions: [] });
  }

  const { q, placeId } = req.query;

  // Selection step: resolve a Google prediction to a structured address.
  if (typeof placeId === 'string' && placeId) {
    if (!GOOGLE_KEY) {
      return res.status(200).json({ success: false, suggestion: null });
    }
    try {
      const suggestion = await googleDetails(placeId);
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).json({ success: !!suggestion, suggestion });
    } catch {
      console.error('[Address Autocomplete] Google details query failed');
      return res.status(200).json({ success: false, suggestion: null });
    }
  }

  if (!q || typeof q !== 'string' || q.trim().length < 3) {
    return res.status(200).json({ success: true, suggestions: [] });
  }

  try {
    const suggestions = GOOGLE_KEY ? await googlePredictions(q) : await photonPredictions(q);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, suggestions });
  } catch {
    // If Google is misconfigured or errors, keep checkout working on the free provider.
    try {
      const suggestions = await photonPredictions(q);
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ success: true, suggestions });
    } catch {
      console.error('[Address Autocomplete] query failed');
      return res.status(200).json({ success: true, suggestions: [] });
    }
  }
}

export default withRateLimitOnly(30, 60000)(handler);
