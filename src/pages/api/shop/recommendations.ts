import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

const FREE_SHIPPING_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// Taxonomy slug mappings
// ---------------------------------------------------------------------------

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
  '4ml-disposable-vapes': 'disposable-vape',
  '5ml-disposable-vapes': 'disposable-vape',
  'vape-cartridges': 'vape-cartridge',
  '2ml-vape-cartridges': 'vape-cartridge',
  '0-5ml-vape-cartridges': 'vape-cartridge',
  'concentrate': 'concentrates',
  'gel-capsules': 'capsules',
};

const CATEGORY_SLUGS: Record<string, string[]> = {
  'disposable-vape': ['disposable-vape', 'disposable-vapes', '2ml-disposable-vapes', '1ml-disposable-vapes', '0-5ml-disposable-vapes', '4ml-disposable-vapes', '5ml-disposable-vapes'],
  'vape-cartridge': ['vape-cartridge', 'vape-cartridges', '2ml-vape-cartridges', '0-5ml-vape-cartridges'],
  'edible': ['edible', 'edibles'],
  'beverage': ['beverage', 'beverages'],
  'bundle': ['bundle', 'bundles'],
  'flower': ['flower'],
  'prerolls': ['prerolls', 'preroll', 'pre-rolls'],
  'accessories': ['accessories'],
  'capsules': ['capsules', 'gel-capsules'],
  'concentrates': ['concentrates', 'concentrate'],
  'syringes': ['syringes'],
  'roll-on': ['roll-on'],
};

const DISP_TYPES = CATEGORY_SLUGS['disposable-vape'];
const CART_TYPES = CATEGORY_SLUGS['vape-cartridge'];
const EDIBLE_TYPES = CATEGORY_SLUGS['edible'];
const FLOWER_TYPES = CATEGORY_SLUGS['flower'];
const PREROLL_TYPES = CATEGORY_SLUGS['prerolls'];
const CONCENTRATE_TYPES = CATEGORY_SLUGS['concentrates'];

function canonicalType(slug: string): string {
  return TYPE_ALIASES[slug] || slug;
}

// ---------------------------------------------------------------------------
// Cart cross-sell map (priority-ordered per spreadsheet)
// ---------------------------------------------------------------------------

const CROSS_SELL_MAP: Record<string, string[]> = {
  'disposable-vape': ['disposable-vape', 'edible', 'flower', 'prerolls'],
  'vape-cartridge': ['vape-cartridge', 'edible', 'flower'],
  'edible': ['disposable-vape', 'flower', 'prerolls', 'beverage'],
  'flower': ['edible', 'disposable-vape', 'prerolls'],
  'prerolls': ['edible', 'disposable-vape', 'flower'],
  'beverage': ['disposable-vape', 'edible', 'prerolls'],
  'bundle': ['edible', 'prerolls', 'flower'],
  'accessories': ['vape-cartridge', 'disposable-vape', 'edible'],
  'capsules': ['edible', 'disposable-vape', 'flower'],
  'concentrates': ['concentrates', 'edible', 'flower', 'disposable-vape'],
  'syringes': ['edible', 'disposable-vape'],
  'roll-on': ['edible', 'disposable-vape'],
};

// ---------------------------------------------------------------------------
// FBT collection-level pairing rules (from FBT Collection Pairings spreadsheet)
//
// Matched top-to-bottom; first match wins. Each companion slot specifies what
// to fetch from the REST endpoint. Price ranges target specific product
// collections within a category (e.g. $50-60 disposable = 4ml Live Resin).
// ---------------------------------------------------------------------------

interface FbtCompanion {
  types?: string[];
  slugs?: string[];
  priceMin?: number;
  priceMax?: number;
  slugLike?: string;
}

interface FbtRule {
  type?: string;
  priceMin?: number;
  priceMax?: number;
  slugContains?: string;
  companions: FbtCompanion[];
}

const FBT_RULES: FbtRule[] = [
  // ── THCp products: always pair with other THCp ──
  { type: 'disposable-vape', slugContains: 'thcp', companions: [
    { types: EDIBLE_TYPES, priceMin: 40, priceMax: 50, slugLike: 'thcp' },
    { types: FLOWER_TYPES, priceMin: 20, priceMax: 30, slugLike: 'thcp' },
  ]},
  { type: 'edible', priceMax: 10, slugContains: 'thcp', companions: [
    { types: DISP_TYPES, priceMin: 30, priceMax: 40, slugLike: 'thcp' },
    { types: EDIBLE_TYPES, priceMin: 40, priceMax: 50, slugLike: 'thcp' },
  ]},
  { type: 'edible', slugContains: 'thcp', companions: [
    { types: DISP_TYPES, priceMin: 30, priceMax: 40, slugLike: 'thcp' },
    { types: FLOWER_TYPES, priceMin: 20, priceMax: 30, slugLike: 'thcp' },
  ]},
  { type: 'vape-cartridge', slugContains: 'thcp', companions: [
    { types: EDIBLE_TYPES, priceMin: 40, priceMax: 50, slugLike: 'thcp' },
    { types: FLOWER_TYPES, priceMin: 20, priceMax: 30, slugLike: 'thcp' },
  ]},
  { type: 'prerolls', slugContains: 'thcp', companions: [
    { types: EDIBLE_TYPES, priceMin: 25, priceMax: 35 },
    { types: FLOWER_TYPES, priceMin: 20, priceMax: 30, slugLike: 'thcp' },
  ]},
  { slugContains: 'thcp', companions: [
    { types: DISP_TYPES, priceMin: 30, priceMax: 40, slugLike: 'thcp' },
    { types: EDIBLE_TYPES, priceMin: 40, priceMax: 50, slugLike: 'thcp' },
  ]},

  // ── Concentrates: Terp Pen (or Fillable Device) + another concentrate ──
  { type: 'concentrates', companions: [
    { slugs: ['terp-pens', 'fillable-2ml-device-kit'] },
    { types: CONCENTRATE_TYPES, priceMin: 40, priceMax: 50 },
  ]},

  // ── Beverage ──
  { type: 'beverage', priceMax: 30, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
  ]},
  { type: 'beverage', companions: [
    { types: EDIBLE_TYPES, priceMin: 25, priceMax: 35 },
  ]},

  // ── Disposable Vape (DISP+DISP is the #1 strategy) ──
  { type: 'disposable-vape', priceMax: 16, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
    { types: PREROLL_TYPES, priceMin: 10, priceMax: 15 },
  ]},
  { type: 'disposable-vape', priceMax: 25, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
  ]},
  { type: 'disposable-vape', priceMax: 33, companions: [
    { types: DISP_TYPES, priceMin: 50, priceMax: 60 },
  ]},
  { type: 'disposable-vape', priceMax: 37, companions: [
    { types: DISP_TYPES, priceMin: 50, priceMax: 60 },
  ]},
  { type: 'disposable-vape', priceMax: 42, companions: [
    { types: DISP_TYPES, priceMin: 40, priceMax: 50 },
  ]},
  { type: 'disposable-vape', priceMax: 48, companions: [
    { types: EDIBLE_TYPES, priceMin: 25, priceMax: 35 },
    { types: PREROLL_TYPES, priceMin: 5, priceMax: 10 },
  ]},
  { type: 'disposable-vape', priceMax: 60, companions: [
    { types: DISP_TYPES, priceMin: 25, priceMax: 35 },
  ]},
  { type: 'disposable-vape', companions: [
    { types: PREROLL_TYPES, priceMin: 5, priceMax: 10 },
    { types: FLOWER_TYPES, priceMin: 5, priceMax: 12 },
  ]},

  // ── Edible ──
  { type: 'edible', priceMax: 7, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
    { types: PREROLL_TYPES, priceMin: 10, priceMax: 15 },
  ]},
  { type: 'edible', priceMax: 15, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
    { types: PREROLL_TYPES, priceMin: 3, priceMax: 5 },
  ]},
  { type: 'edible', priceMax: 40, companions: [
    { types: DISP_TYPES, priceMin: 50, priceMax: 60 },
  ]},
  { type: 'edible', companions: [
    { types: DISP_TYPES, priceMin: 25, priceMax: 35 },
    { types: FLOWER_TYPES, priceMin: 20, priceMax: 30 },
  ]},

  // ── Flower ──
  { type: 'flower', priceMax: 12, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
    { types: PREROLL_TYPES, priceMin: 5, priceMax: 10 },
  ]},
  { type: 'flower', priceMax: 30, companions: [
    { types: DISP_TYPES, priceMin: 50, priceMax: 60 },
    { types: PREROLL_TYPES, priceMin: 3, priceMax: 5 },
  ]},
  { type: 'flower', companions: [
    { types: DISP_TYPES, priceMin: 50, priceMax: 60 },
  ]},

  // ── Prerolls ──
  { type: 'prerolls', priceMax: 5, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
    { types: EDIBLE_TYPES, priceMin: 8, priceMax: 15 },
  ]},
  { type: 'prerolls', priceMax: 10, companions: [
    { types: DISP_TYPES, priceMin: 60, priceMax: 70 },
    { types: FLOWER_TYPES, priceMin: 5, priceMax: 12 },
  ]},
  { type: 'prerolls', priceMax: 15, companions: [
    { types: DISP_TYPES, priceMin: 40, priceMax: 50 },
    { types: FLOWER_TYPES, priceMin: 20, priceMax: 30 },
  ]},
  { type: 'prerolls', companions: [
    { types: EDIBLE_TYPES, priceMin: 25, priceMax: 35 },
    { types: FLOWER_TYPES, priceMin: 20, priceMax: 30 },
  ]},

  // ── Vape Cartridge (upgrade path + Airflow Battery) ──
  { type: 'vape-cartridge', priceMax: 20, companions: [
    { types: CART_TYPES, priceMin: 42, priceMax: 50 },
    { types: EDIBLE_TYPES, priceMin: 25, priceMax: 35 },
  ]},
  { type: 'vape-cartridge', priceMax: 35, companions: [
    { types: CART_TYPES, priceMin: 42, priceMax: 50 },
    { slugs: ['airflow-battery'] },
  ]},
  { type: 'vape-cartridge', companions: [
    { slugs: ['airflow-battery'] },
    { types: EDIBLE_TYPES, priceMin: 25, priceMax: 35 },
  ]},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  priceMin?: number;
  priceMax?: number;
  slugLike?: string;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params.types?.length) qs.set('types', params.types.join(','));
  if (params.slugs?.length) qs.set('slugs', params.slugs.join(','));
  if (params.exclude?.length) qs.set('exclude', params.exclude.join(','));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.priceMin) qs.set('price_min', String(params.priceMin));
  if (params.priceMax) qs.set('price_max', String(params.priceMax));
  if (params.slugLike) qs.set('slug_like', params.slugLike);

  try {
    const res = await fetch(`${wpUrl}/wp-json/mf/v1/recs-products?${qs}`);
    const data = await res.json();
    return data?.success ? data.products || [] : [];
  } catch {
    return [];
  }
}

function transformProduct(p: any) {
  return {
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
  };
}

// ---------------------------------------------------------------------------
// FBT handler — collection-level pairings from spreadsheet
// ---------------------------------------------------------------------------

function matchesFbtRule(rule: FbtRule, anchorType: string, anchorPrice: number, anchorSlug: string): boolean {
  if (rule.slugContains && !anchorSlug.includes(rule.slugContains)) return false;
  if (rule.type && rule.type !== anchorType) return false;
  if (rule.priceMin !== undefined && anchorPrice < rule.priceMin) return false;
  if (rule.priceMax !== undefined && anchorPrice > rule.priceMax) return false;
  return true;
}

async function handleFbt(
  anchorTypes: string[],
  anchorPrice: number,
  anchorSlug: string,
  excludeIds: number[],
  excludeSlugs: string[],
): Promise<any[]> {
  const anchorType = anchorTypes[0] || '';
  const rule = FBT_RULES.find((r) => matchesFbtRule(r, anchorType, anchorPrice, anchorSlug));

  const results: any[] = [];
  const seenIds = new Set(excludeIds);
  const seenSlugs = new Set(excludeSlugs);

  const addResult = (product: any): boolean => {
    if (!product?.databaseId || seenIds.has(product.databaseId)) return false;
    if (seenSlugs.has(product.slug)) return false;
    seenIds.add(product.databaseId);
    seenSlugs.add(product.slug);
    results.push(product);
    return true;
  };

  if (rule) {
    const fetches = rule.companions.map((spec) =>
      fetchRecsProducts({
        types: spec.types,
        slugs: spec.slugs,
        exclude: excludeIds,
        limit: 3,
        priceMin: spec.priceMin,
        priceMax: spec.priceMax,
        slugLike: spec.slugLike,
      })
    );
    const fetchResults = await Promise.all(fetches);

    for (const products of fetchResults) {
      if (results.length >= 2) break;
      for (const p of products) {
        if (addResult(p)) break;
      }
    }
  }

  // Fill remaining slots with generic cross-sells if rule didn't fill both
  if (results.length < 2) {
    const recCategories: string[] = [];
    for (const t of anchorTypes) {
      for (const rec of CROSS_SELL_MAP[t] || []) {
        if (!recCategories.includes(rec)) recCategories.push(rec);
      }
    }
    const remaining = 2 - results.length;
    const allExclude = [...excludeIds, ...Array.from(seenIds)];
    for (const cat of recCategories.slice(0, 3)) {
      if (results.length >= 2) break;
      const typeSlugs = CATEGORY_SLUGS[cat] || [cat];
      const products = await fetchRecsProducts({ types: typeSlugs, limit: 2, exclude: allExclude });
      for (const p of products) {
        if (results.length >= 2) break;
        addResult(p);
      }
    }
  }

  return results.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Cart handler — cross-sells + impulse add-ons
// ---------------------------------------------------------------------------

async function handleCart(
  cartTypeSlugs: string[],
  cartProductSlugs: string[],
  cartTotal: number,
  excludeIds: number[],
  limit: number,
): Promise<any[]> {
  const excludeSet = new Set(excludeIds);
  const excludeSlugSet = new Set(cartProductSlugs);
  const gap = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);
  const results: any[] = [];
  const seenIds = new Set<number>();

  const hasDisposables = cartTypeSlugs.includes('disposable-vape');
  const hasCartridges = cartTypeSlugs.includes('vape-cartridge');
  const hasConcentrates = cartTypeSlugs.includes('concentrates');
  const hasTHCp = cartProductSlugs.some((s) => s.includes('thcp'));
  const hasEdibles = cartTypeSlugs.includes('edible');
  const hasFlower = cartTypeSlugs.includes('flower');
  const hasPrerolls = cartTypeSlugs.includes('prerolls');

  const addResult = (product: any): boolean => {
    if (!product?.databaseId || seenIds.has(product.databaseId) || excludeSet.has(product.databaseId)) return false;
    if (excludeSlugSet.has(product.slug)) return false;
    seenIds.add(product.databaseId);
    results.push(product);
    return true;
  };

  // ── Specific product rules ──
  const specificSlugs: string[] = [];
  if (hasConcentrates) {
    if (!excludeSlugSet.has('terp-pens')) specificSlugs.push('terp-pens');
    if (!excludeSlugSet.has('fillable-2ml-device-kit')) specificSlugs.push('fillable-2ml-device-kit');
  }
  if (hasCartridges && !excludeSlugSet.has('airflow-battery')) {
    specificSlugs.push('airflow-battery');
  }
  if (specificSlugs.length > 0) {
    const specificProducts = await fetchRecsProducts({ slugs: specificSlugs, exclude: excludeIds });
    for (const p of specificProducts) addResult(p);
  }

  // Decide how many slots for cross-sells vs impulse
  const wantsImpulse = gap > 0 && gap <= 20;
  const crossSellLimit = wantsImpulse ? Math.max(2, Math.ceil(limit / 2)) : limit;

  // ── Category cross-sells ──
  const recCategories: string[] = [];
  for (const cartType of cartTypeSlugs) {
    for (const rec of CROSS_SELL_MAP[cartType] || []) {
      if (hasCartridges && rec === 'disposable-vape') continue;
      if (hasDisposables && rec === 'vape-cartridge') continue;
      if (!recCategories.includes(rec)) recCategories.push(rec);
    }
  }

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
    let valid = (fetchResults[i] || []).filter(
      (p: any) => p.databaseId && !excludeSet.has(p.databaseId) && !seenIds.has(p.databaseId) && !excludeSlugSet.has(p.slug)
    );

    if (hasTHCp) {
      const thcpProducts = valid.filter((p: any) => p.name?.toLowerCase().includes('thcp') || p.slug?.includes('thcp'));
      if (thcpProducts.length > 0) valid = thcpProducts;
    }

    if (gap > 0) {
      valid.sort((a: any, b: any) => Math.abs(parsePrice(a.price) - gap) - Math.abs(parsePrice(b.price) - gap));
    }

    categoryProducts[slug] = valid;
  }

  let round = 0;
  while (results.length < crossSellLimit && round < 4) {
    let addedThisRound = false;
    for (const slug of categoriesToFetch) {
      if (results.length >= crossSellLimit) break;
      const pick = (categoryProducts[slug] || [])[round];
      if (pick && addResult(pick)) addedThisRound = true;
    }
    if (!addedThisRound) break;
    round++;
  }

  // ── Impulse add-ons (cheap gap-closers, only when under $80) ──
  if (wantsImpulse && results.length < limit) {
    const impulseTypes = [...EDIBLE_TYPES, ...PREROLL_TYPES, ...FLOWER_TYPES];
    if (hasDisposables) impulseTypes.push(...DISP_TYPES);
    if (hasCartridges) impulseTypes.push(...CART_TYPES);

    const impulseCandidates = await fetchRecsProducts({
      types: impulseTypes,
      priceMax: Math.min(gap + 5, 16),
      exclude: [...excludeIds, ...Array.from(seenIds)],
      limit: 12,
    });

    const isVapeOnly = cartTypeSlugs.every(
      (t) => t === 'disposable-vape' || t === 'vape-cartridge'
    );

    const filtered = impulseCandidates.filter((p: any) => {
      if (seenIds.has(p.databaseId) || excludeSet.has(p.databaseId) || excludeSlugSet.has(p.slug)) return false;
      const pTypes = (p.mfproductTypes?.nodes || []).map((t: any) => canonicalType(t.slug || ''));
      const isDispItem = pTypes.includes('disposable-vape');
      const isCartItem = pTypes.includes('vape-cartridge');
      const isFlowerItem = pTypes.includes('flower');
      const isPrerollItem = pTypes.includes('prerolls');

      if (isDispItem && !hasDisposables) return false;
      if (isCartItem && !hasCartridges) return false;
      if ((isFlowerItem || isPrerollItem) && isVapeOnly) return false;
      return true;
    });

    if (hasTHCp) {
      filtered.sort((a: any, b: any) => {
        const aT = a.slug?.includes('thcp') ? 0 : 1;
        const bT = b.slug?.includes('thcp') ? 0 : 1;
        if (aT !== bT) return aT - bT;
        return Math.abs(parsePrice(a.price) - gap) - Math.abs(parsePrice(b.price) - gap);
      });
    } else {
      filtered.sort((a: any, b: any) => Math.abs(parsePrice(a.price) - gap) - Math.abs(parsePrice(b.price) - gap));
    }

    for (const p of filtered) {
      if (results.length >= limit) break;
      addResult(p);
    }
  }

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const context = (typeof req.query.context === 'string' ? req.query.context : 'cart') as 'fbt' | 'cart';

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

  // Resolve product types from cart item IDs if not provided directly
  if (cartTypeSlugs.length === 0 && cartProductIds.length > 0) {
    try {
      const typesRes = await fetch(`${wpUrl}/wp-json/mf/v1/product-types?ids=${cartProductIds.join(',')}`);
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
    let products: any[];

    if (context === 'fbt') {
      products = await handleFbt(
        cartTypeSlugs,
        cartTotal,
        cartProductSlugs[0] || '',
        excludeIds,
        cartProductSlugs,
      );
    } else {
      products = await handleCart(
        cartTypeSlugs,
        cartProductSlugs,
        cartTotal,
        excludeIds,
        limit,
      );
    }

    const transformed = products.map(transformProduct);

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, products: transformed, count: transformed.length });
  } catch (err) {
    console.error('[Recommendations] Request failed');
    return res.status(500).json({ success: false, message: 'Recommendation service unavailable', products: [] });
  }
}

export default withRateLimitOnly(20, 60000)(handler);
