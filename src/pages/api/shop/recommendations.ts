import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import { withRateLimitOnly } from '@/lib/middleware';
import { cachedQuery } from '@/lib/cache';

/**
 * Cross-sell Recommendations API
 *
 * Uses GraphQL with custom taxonomy filters (via mellow-fellow-graphql-filters mu-plugin).
 * Smart rules based on the FBT Pairings Map CSVs.
 */

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

// GraphQL query to fetch products filtered by product-type taxonomy (single slug)
const GET_PRODUCTS_BY_TYPE = gql`
  query GetProductsByType($mfProductType: String!, $first: Int = 4) {
    products(first: $first, where: { status: "publish", mfProductType: $mfProductType }) {
      nodes {
        __typename
        ... on SimpleProduct {
          id
          databaseId
          name
          slug
          price
          regularPrice
          salePrice
          stockStatus
          image { id sourceUrl altText }
          mfproductTypes { nodes { name } }
          productLines { nodes { name } }
          cannabinoids { nodes { name } }
        }
      }
    }
  }
`;

// Batched query using mfProductTypeIn array filter — 1 query instead of N
const GET_PRODUCTS_BY_TYPES = gql`
  query GetProductsByTypes($mfProductTypeIn: [String]!, $first: Int = 8) {
    products(first: $first, where: { status: "publish", mfProductTypeIn: $mfProductTypeIn }) {
      nodes {
        __typename
        ... on SimpleProduct {
          id
          databaseId
          name
          slug
          price
          regularPrice
          salePrice
          stockStatus
          image { id sourceUrl altText }
          mfproductTypes { nodes { name } }
          productLines { nodes { name } }
          cannabinoids { nodes { name } }
        }
      }
    }
  }
`;

const GET_PRODUCT_BY_SLUG = gql`
  query GetProductBySlugForRecommendations($slug: ID!) {
    product(id: $slug, idType: SLUG) {
      __typename
      ... on SimpleProduct {
        id
        databaseId
        name
        slug
        price
        regularPrice
        salePrice
        stockStatus
        image { id sourceUrl altText }
        mfproductTypes { nodes { name } }
        productLines { nodes { name } }
        cannabinoids { nodes { name } }
      }
    }
  }
`;

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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const cartTypeSlugs = Array.from(
    new Set(
      parseSlugs(typeof req.query.productTypes === 'string' ? req.query.productTypes : undefined).map(canonicalType)
    )
  );
  const cartProductSlugs = parseSlugs(typeof req.query.cartProductSlugs === 'string' ? req.query.cartProductSlugs : undefined);
  const cartTotal = parseFloat(typeof req.query.cartTotal === 'string' ? req.query.cartTotal : '0') || 0;
  const excludeIds = parseIds(typeof req.query.excludeProductIds === 'string' ? req.query.excludeProductIds : undefined);
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 4;
  const limit = Math.max(1, Math.min(10, Number.isFinite(limitRaw) ? limitRaw : 4));

  if (cartTypeSlugs.length === 0) {
    return res.status(200).json({ success: true, products: [], count: 0 });
  }

  try {
    const client = getClient();
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
      if (!product || seenIds.has(product.databaseId) || excludeSet.has(product.databaseId)) return false;
      if (excludeSlugSet.has(product.slug)) return false;
      seenIds.add(product.databaseId);
      results.push(product);
      return true;
    };

    const fetchBySlug = async (slug: string): Promise<any | null> => {
      try {
        const { data } = await cachedQuery(client, {
          query: GET_PRODUCT_BY_SLUG,
          variables: { slug },
        }, { ttl: 300 });
        return data?.product || null;
      } catch { return null; }
    };

    const fetchByType = async (typeSlug: string, first = 4): Promise<any[]> => {
      try {
        const { data } = await cachedQuery(client, {
          query: GET_PRODUCTS_BY_TYPE,
          variables: { mfProductType: typeSlug, first },
        }, { ttl: 300 });
        return data?.products?.nodes || [];
      } catch { return []; }
    };

    const fetchByCategory = async (category: string, first = 4): Promise<any[]> => {
      const slugs = CATEGORY_SLUGS[category] || [category];
      try {
        const { data } = await cachedQuery(client, {
          query: GET_PRODUCTS_BY_TYPES,
          variables: { mfProductTypeIn: slugs, first },
        }, { ttl: 300 });
        return data?.products?.nodes || [];
      } catch { return []; }
    };

    // RULE 1 & 2: Fetch specific products in parallel
    const specificFetches: Promise<any>[] = [];
    if (hasConcentrates && !excludeSlugSet.has(TERP_PEN_SLUG)) {
      specificFetches.push(fetchBySlug(TERP_PEN_SLUG).then((p) => p && addResult(p)));
    }
    if (hasCartridges && !excludeSlugSet.has(AIRFLOW_BATTERY_SLUG)) {
      specificFetches.push(fetchBySlug(AIRFLOW_BATTERY_SLUG).then((p) => p && addResult(p)));
    }
    await Promise.all(specificFetches);

    // RULE 3: Build cross-sell categories with exclusion rules
    const recCategories: string[] = [];
    for (const cartType of cartTypeSlugs) {
      for (const rec of (CROSS_SELL_MAP[cartType] || [])) {
        // Never recommend disposables to cart buyers or vice versa
        if (hasCartridges && rec === 'disposable-vape') continue;
        if (hasDisposables && rec === 'vape-cartridge') continue;
        if (!recCategories.includes(rec)) recCategories.push(rec);
      }
    }

    // RULE 4: Fetch from all categories in parallel via GraphQL
    const categoriesToFetch = recCategories.slice(0, 4);
    const fetchPromises = categoriesToFetch.map((category) => fetchByCategory(category, 4));
    const fetchResults = await Promise.all(fetchPromises);

    const categoryProducts: Record<string, any[]> = {};
    for (let i = 0; i < categoriesToFetch.length; i++) {
      const slug = categoriesToFetch[i];
      let valid = (fetchResults[i] || []).filter((p: any) =>
        !excludeSet.has(p.databaseId) && !seenIds.has(p.databaseId) && !excludeSlugSet.has(p.slug)
      );

      // THCp isolation: prefer THCp products if cart has THCp
      if (hasTHCp) {
        const thcpProducts = valid.filter((p: any) =>
          p.name?.toLowerCase().includes('thcp') || p.slug?.includes('thcp')
        );
        if (thcpProducts.length > 0) valid = thcpProducts;
      }

      // Sort by price proximity to free shipping gap
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

    // Transform to consistent format
    const transformed = results.slice(0, limit).map((p: any) => {
      const cannabinoidNames = (p.cannabinoids?.nodes || []).map((c: any) => c.name).filter(Boolean);
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
        typeLabel: p.mfproductTypes?.nodes?.[0]?.name || '',
        subtitle: p.productLines?.nodes?.[0]?.name || cannabinoidNames.join(' + ') || '',
      };
    });

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, products: transformed, count: transformed.length });
  } catch (err) {
    console.error('[Recommendations] Request failed');
    return res.status(500).json({ success: false, message: 'Recommendation service unavailable', products: [] });
  }
}

export default withRateLimitOnly(20, 60000)(handler);
