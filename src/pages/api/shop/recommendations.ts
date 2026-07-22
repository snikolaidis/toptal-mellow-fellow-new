import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

const FREE_SHIPPING_THRESHOLD = 80;

const TERP_PEN_SLUG = 'terp-pens';
const AIRFLOW_BATTERY_SLUG = 'airflow-battery';

const CROSS_SELL_MAP: Record<string, string[]> = {
  'disposable-vape': ['edible', 'flower', 'prerolls', 'disposable-vape'],
  'vape-cartridge': ['edible', 'flower', 'vape-cartridge'],
  'edible': ['disposable-vape', 'flower', 'prerolls', 'beverage'],
  'flower': ['edible', 'disposable-vape', 'prerolls'],
  'prerolls': ['edible', 'disposable-vape', 'flower'],
  'beverage': ['disposable-vape', 'edible', 'prerolls'],
  'bundle': ['edible', 'prerolls', 'flower'],
  'accessories': ['vape-cartridge', 'disposable-vape', 'edible'],
  'capsules': ['edible', 'disposable-vape', 'flower'],
  'concentrates': ['edible', 'flower', 'disposable-vape'],
  'syringes': ['edible', 'disposable-vape'],
  'roll-on': ['edible', 'disposable-vape'],
};

const TYPE_ALIASES: Record<string, string> = {
  'edibles': 'edible',
  'beverages': 'beverage',
  'bundles': 'bundle',
  'preroll': 'prerolls',
  'pre-rolls': 'prerolls',
  'disposable-vapes': 'disposable-vape',
  '2ml-disposable-vapes': 'disposable-vape',
  '1ml-disposable-vapes': 'disposable-vape',
  '0-5ml-disposable-vapes': 'disposable-vape',
  'vape-cartridges': 'vape-cartridge',
  '2ml-vape-cartridges': 'vape-cartridge',
  'concentrate': 'concentrates',
};

const CATEGORY_SLUGS: Record<string, string[]> = {
  'disposable-vape': ['disposable-vape', 'disposable-vapes', '2ml-disposable-vapes', '1ml-disposable-vapes', '0-5ml-disposable-vapes'],
  'vape-cartridge': ['vape-cartridge', 'vape-cartridges', '2ml-vape-cartridges'],
  'edible': ['edible', 'edibles'],
  'beverage': ['beverage', 'beverages'],
  'bundle': ['bundle', 'bundles'],
  'flower': ['flower'],
  'prerolls': ['prerolls', 'preroll', 'pre-rolls'],
  'accessories': ['accessories'],
  'capsules': ['capsules'],
  'concentrates': ['concentrates', 'concentrate'],
  'syringes': ['syringes'],
  'roll-on': ['roll-on'],
};

function canonicalType(slug: string): string {
  return TYPE_ALIASES[slug] || slug;
}

function parseIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
}

function parseSlugs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function parsePrice(price: string | undefined): number {
  if (!price) return 0;
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

async function fetchRecsProducts(params: {
  types?: string[];
  slugs?: string[];
  exclude?: number[];
  limit?: number;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params.types?.length) qs.set('types', params.types.join(','));
  if (params.slugs?.length) qs.set('slugs', params.slugs.join(','));
  if (params.exclude?.length) qs.set('exclude', params.exclude.join(','));
  if (params.limit) qs.set('limit', String(params.limit));

  try {
    const res = await fetch(`${wpUrl}/wp-json/mf/v1/recs-products?${qs}`);
    const data = await res.json();
    return data?.success ? data.products || [] : [];
  } catch {
    return [];
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  let cartTypeSlugs = Array.from(
    new Set(
      parseSlugs(typeof req.query.productTypes === 'string' ? req.query.productTypes : undefined).map(canonicalType)
    )
  );
  const cartProductSlugs = parseSlugs(typeof req.query.cartProductSlugs === 'string' ? req.query.cartProductSlugs : undefined);
  const cartProductIds = parseIds(typeof req.query.cartProductIds === 'string' ? req.query.cartProductIds : undefined);
  const cartTotal = parseFloat(typeof req.query.cartTotal === 'string' ? req.query.cartTotal : '0') || 0;
  const excludeIds = parseIds(typeof req.query.excludeProductIds === 'string' ? req.query.excludeProductIds : undefined);
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 4;
  const limit = Math.max(1, Math.min(10, Number.isFinite(limitRaw) ? limitRaw : 4));

  if (cartTypeSlugs.length === 0 && cartProductIds.length > 0) {
    try {
      const typesRes = await fetch(
        `${wpUrl}/wp-json/mf/v1/product-types?ids=${cartProductIds.join(',')}`
      );
      const typesData = await typesRes.json();
      if (typesData?.success && typesData.types) {
        const allSlugs: string[] = [];
        for (const slugs of Object.values(typesData.types) as string[][]) {
          allSlugs.push(...slugs);
        }
        cartTypeSlugs = Array.from(new Set(allSlugs.map(canonicalType)));
      }
    } catch {}
  }

  if (cartTypeSlugs.length === 0) {
    return res.status(200).json({ success: true, products: [], count: 0 });
  }

  try {
    const excludeSet = new Set(excludeIds);
    const excludeSlugSet = new Set(cartProductSlugs);
    const gap = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);
    const results: any[] = [];
    const seenIds = new Set<number>();

    const hasDisposables = cartTypeSlugs.includes('disposable-vape');
    const hasCartridges = cartTypeSlugs.includes('vape-cartridge');
    const hasConcentrates = cartTypeSlugs.includes('concentrates');
    const hasTHCp = cartProductSlugs.some((s) => s.includes('thcp'));

    const addResult = (product: any): boolean => {
      if (!product || !product.databaseId || seenIds.has(product.databaseId) || excludeSet.has(product.databaseId)) return false;
      if (excludeSlugSet.has(product.slug)) return false;
      seenIds.add(product.databaseId);
      results.push(product);
      return true;
    };

    // RULE 1 & 2: Fetch specific products (concentrates → Terp Pen, cartridges → Airflow Battery)
    const specificSlugs: string[] = [];
    if (hasConcentrates && !excludeSlugSet.has(TERP_PEN_SLUG)) {
      specificSlugs.push(TERP_PEN_SLUG);
    }
    if (hasCartridges && !excludeSlugSet.has(AIRFLOW_BATTERY_SLUG)) {
      specificSlugs.push(AIRFLOW_BATTERY_SLUG);
    }
    if (specificSlugs.length > 0) {
      const specificProducts = await fetchRecsProducts({
        slugs: specificSlugs,
        exclude: excludeIds,
      });
      for (const p of specificProducts) {
        addResult(p);
      }
    }

    // RULE 3: Build cross-sell categories with exclusion rules
    const recCategories: string[] = [];
    for (const cartType of cartTypeSlugs) {
      for (const rec of (CROSS_SELL_MAP[cartType] || [])) {
        if (hasCartridges && rec === 'disposable-vape') continue;
        if (hasDisposables && rec === 'vape-cartridge') continue;
        if (!recCategories.includes(rec)) recCategories.push(rec);
      }
    }

    // RULE 4: Fetch from categories via REST SQL
    const categoriesToFetch = recCategories.slice(0, 4);
    const allExcludeIds = [...excludeIds, ...Array.from(seenIds)];
    const fetchPromises = categoriesToFetch.map((category) => {
      const typeSlugs = CATEGORY_SLUGS[category] || [category];
      return fetchRecsProducts({ types: typeSlugs, limit: 4, exclude: allExcludeIds });
    });
    const fetchResults = await Promise.all(fetchPromises);

    const categoryProducts: Record<string, any[]> = {};
    for (let i = 0; i < categoriesToFetch.length; i++) {
      const slug = categoriesToFetch[i];
      let valid = (fetchResults[i] || []).filter((p: any) =>
        p.databaseId && !excludeSet.has(p.databaseId) && !seenIds.has(p.databaseId) && !excludeSlugSet.has(p.slug)
      );

      if (hasTHCp) {
        const thcpProducts = valid.filter((p: any) =>
          p.name?.toLowerCase().includes('thcp') || p.slug?.includes('thcp')
        );
        if (thcpProducts.length > 0) valid = thcpProducts;
      }

      if (gap > 0) {
        valid.sort((a: any, b: any) =>
          Math.abs(parsePrice(a.price) - gap) - Math.abs(parsePrice(b.price) - gap)
        );
      }

      categoryProducts[slug] = valid;
    }

    // Round-robin: 1 product from each category per round
    let round = 0;
    while (results.length < limit && round < 4) {
      let addedThisRound = false;
      for (const slug of categoriesToFetch) {
        if (results.length >= limit) break;
        const pick = (categoryProducts[slug] || [])[round];
        if (pick && addResult(pick)) addedThisRound = true;
      }
      if (!addedThisRound) break;
      round++;
    }

    // REST endpoint already returns the right shape — just pass through
    const transformed = results.slice(0, limit).map((p: any) => ({
      id: p.id,
      databaseId: p.databaseId,
      name: p.name,
      slug: p.slug,
      price: p.price || '',
      regularPrice: p.regularPrice || undefined,
      salePrice: p.salePrice || undefined,
      stockStatus: p.stockStatus || 'IN_STOCK',
      image: p.image || undefined,
      typeLabel: p.typeLabel || p.mfproductTypes?.nodes?.[0]?.name || '',
      subtitle: p.subtitle || '',
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, products: transformed, count: transformed.length });
  } catch (err) {
    console.error('[Recommendations] Request failed');
    return res.status(500).json({ success: false, message: 'Recommendation service unavailable', products: [] });
  }
}

export default withRateLimitOnly(20, 60000)(handler);
