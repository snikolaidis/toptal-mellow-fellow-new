import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCTS } from '@/graphql/queries/products';
import { withRateLimitOnly } from '@/lib/middleware';

/**
 * Shop Products API
 *
 * Handles paginated product loading for the "Load More" button.
 * Supports taxonomy filtering and sorting via query params.
 */

const FILTER_PARAM_MAP: Record<string, string> = {
  productType: 'mfProductTypeIn',
  strainType: 'strainTypeFilterIn',
  blendType: 'blendTypeFilterIn',
  cannabinoid: 'cannabinoidFilterIn',
  singleCannabinoid: 'singleCannabinoidFilterIn',
  size: 'sizeFilterIn',
  mg: 'mgFilterIn',
  pieces: 'piecesFilterIn',
  collection: 'collectionFilterIn',
};

function getSortVariables(sort: string) {
  switch (sort) {
    case 'newest':
      return { orderby: [{ field: 'DATE', order: 'DESC' }] };
    case 'price-low':
      return { orderby: [{ field: 'PRICE', order: 'ASC' }] };
    case 'price-high':
      return { orderby: [{ field: 'PRICE', order: 'DESC' }] };
    case 'name-asc':
      return { orderby: [{ field: 'NAME', order: 'ASC' }] };
    case 'name-desc':
      return { orderby: [{ field: 'NAME', order: 'DESC' }] };
    default:
      return {};
  }
}

function parseFilters(query: Record<string, string | string[] | undefined>): Record<string, string[]> {
  const vars: Record<string, string[]> = {};
  for (const [paramKey, gqlKey] of Object.entries(FILTER_PARAM_MAP)) {
    const val = query[paramKey];
    if (typeof val === 'string' && val) {
      vars[gqlKey] = val.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return vars;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  const firstRaw = typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : 24;
  const first = Math.max(1, Math.min(100, Number.isFinite(firstRaw) ? firstRaw : 24));
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'default';
  const filterVars = parseFilters(req.query);

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
