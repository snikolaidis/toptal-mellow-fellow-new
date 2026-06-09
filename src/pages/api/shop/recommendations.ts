import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import { withRateLimitOnly } from '@/lib/middleware';

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

// GraphQL query to fetch products filtered by product-type taxonomy
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
        }
      }
    }
  }
`;

const GET_PRODUCT_BY_SLUG = gql`
  query GetProductBySlug($slug: ID!) {
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

  const cartTypeSlugs = parseSlugs(typeof req.query.productTypes === 'string' ? req.query.productTypes : undefined);
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
        const { data } = await client.query({
          query: GET_PRODUCT_BY_SLUG,
          variables: { slug },
          fetchPolicy: 'network-only',
        });
        return data?.product || null;
      } catch { return null; }
    };

    const fetchByType = async (typeSlug: string, first = 4): Promise<any[]> => {
      try {
        const { data } = await client.query({
          query: GET_PRODUCTS_BY_TYPE,
          variables: { mfProductType: typeSlug, first },
          fetchPolicy: 'network-only',
        });
        return data?.products?.nodes || [];
      } catch { return []; }
    };

    // RULE 1: Concentrates → Terp Pen
    if (hasConcentrates && !excludeSlugSet.has(TERP_PEN_SLUG)) {
      const terpPen = await fetchBySlug(TERP_PEN_SLUG);
      if (terpPen) addResult(terpPen);
    }

    // RULE 2: Vape Cartridges → Airflow Battery
    if (hasCartridges && !excludeSlugSet.has(AIRFLOW_BATTERY_SLUG)) {
      const battery = await fetchBySlug(AIRFLOW_BATTERY_SLUG);
      if (battery) addResult(battery);
    }

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
    const fetchPromises = categoriesToFetch.map((slug) => fetchByType(slug, 4));
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
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, products: transformed, count: transformed.length });
  } catch (err) {
    console.error('[Recommendations] Request failed');
    return res.status(500).json({ success: false, message: 'Recommendation service unavailable', products: [] });
  }
}

export default withRateLimitOnly(20, 60000)(handler);
