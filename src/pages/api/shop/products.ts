import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCTS, GET_PRODUCTS_BY_CATEGORY } from '@/graphql/queries/products';
import { withRateLimitOnly } from '@/lib/middleware';

/**
 * Shop Products API
 *
 * Handles paginated product loading for the "Load More" button.
 * Supports category filtering and sorting via query params.
 */

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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  const firstRaw = typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : 24;
  const first = Math.max(1, Math.min(100, Number.isFinite(firstRaw) ? firstRaw : 24));
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'default';

  try {
    const client = getClient();
    const sortVars = getSortVariables(sort);

    const variables = {
      first,
      after,
      ...sortVars,
      ...(category ? { categorySlug: category } : {}),
    };

    const { data, errors } = await client.query({
      query: category ? GET_PRODUCTS_BY_CATEGORY : GET_PRODUCTS,
      variables,
      fetchPolicy: 'network-only',
    });

    if (errors?.length) {
      console.error('[Shop API] GraphQL errors');
    }

    const products = data?.products?.nodes || [];
    const pageInfo = data?.products?.pageInfo || {};

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      success: true,
      products,
      hasNextPage: pageInfo.hasNextPage || false,
      endCursor: pageInfo.endCursor || null,
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
