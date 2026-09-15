import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCTS } from '@/graphql/queries/products';
import { withRateLimitOnly } from '@/lib/middleware';
import {
  parseFilterParams,
  filtersToGraphQLVars,
  getSortVariables,
} from '@/lib/shopFilters';

const COLLECTION_FILTER_KEYS = [
  'productType', 'strainType', 'blendType', 'cannabinoid',
  'singleCannabinoid', 'size', 'mg', 'pieces',
];

// Mirrors MF_TAXONOMY_PARAM_ALLOWLIST in mellow-fellow-taxonomy-param.php. An
// unlisted taxonomy is not rejected, it silently falls back to `collection` and
// serves the wrong products, so both lists have to be kept in step.
const ALLOWED_TAXONOMIES = ['collection', 'mood', 'product_cat'];

async function handleCollectionProducts(req: NextApiRequest, res: NextApiResponse) {
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const collection = req.query.collection as string;
  const page = typeof req.query.page === 'string' ? req.query.page : '1';
  const perPage = typeof req.query.first === 'string' ? req.query.first : '24';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'default';
  const requestedTaxonomy = typeof req.query.taxonomy === 'string' ? req.query.taxonomy : '';
  const taxonomy = ALLOWED_TAXONOMIES.includes(requestedTaxonomy)
    ? requestedTaxonomy
    : 'collection';

  const params = new URLSearchParams({
    slug: collection,
    taxonomy,
    page,
    per_page: perPage,
    sort,
  });

  const filters = parseFilterParams(req.query);
  for (const key of COLLECTION_FILTER_KEYS) {
    if (filters[key]?.length) {
      params.set(key, filters[key].join(','));
    }
  }

  // Price range forwards to the collection-products endpoint as min_price /
  // max_price (see the PHP handler). Strictly positive; anything else is dropped
  // so a bad or zero value cannot skew the query.
  const priceParam = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? String(n) : null;
  };
  const minPrice = priceParam(req.query.minPrice);
  const maxPrice = priceParam(req.query.maxPrice);
  if (minPrice !== null) params.set('min_price', minPrice);
  if (maxPrice !== null) params.set('max_price', maxPrice);

  const upstream = await fetch(`${wpUrl}/wp-json/mf/v1/collection-products?${params.toString()}`);
  const data = await upstream.json();

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(upstream.ok ? 200 : 502).json(data);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (typeof req.query.collection === 'string' && req.query.collection) {
    return handleCollectionProducts(req, res);
  }

  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  const firstRaw = typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : 24;
  const first = Math.max(1, Math.min(100, Number.isFinite(firstRaw) ? firstRaw : 24));
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'default';
  const filterVars = filtersToGraphQLVars(parseFilterParams(req.query));

  try {
    const client = getClient();
    const sortVars = getSortVariables(sort);

    const { data, errors } = await client.query({
      query: GET_PRODUCTS,
      variables: { first, after, ...sortVars, ...filterVars },
      fetchPolicy: 'network-only',
    });

    if (errors?.length) {
      console.error('[Shop API] GraphQL errors');
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      success: true,
      products: data?.products?.nodes || [],
      hasNextPage: data?.products?.pageInfo?.hasNextPage || false,
      endCursor: data?.products?.pageInfo?.endCursor || null,
    });
  } catch (error) {
    console.error('[Shop API] Request failed');
    return res.status(500).json({
      success: false,
      message: 'Failed to load products',
      products: [],
    });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
