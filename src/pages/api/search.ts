/**
 * Product Search API Endpoint
 *
 * Searches WooCommerce products via GraphQL and returns matching results
 * for the predictive search modal.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import { withRateLimitOnly } from '@/lib/middleware';

// Search query - uses WPGraphQL WooCommerce search parameter
const SEARCH_PRODUCTS = gql`
  query SearchProducts($search: String!, $first: Int = 8, $after: String) {
    products(
      first: $first
      after: $after
      where: { search: $search, status: "publish" }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
          description
          image {
            sourceUrl
            altText
          }
        }
        ... on VariableProduct {
          id
          databaseId
          name
          slug
          price
          regularPrice
          salePrice
          stockStatus
          description
          image {
            sourceUrl
            altText
          }
        }
        ... on ExternalProduct {
          id
          databaseId
          name
          slug
          price
          description
          image {
            sourceUrl
            altText
          }
        }
        ... on GroupProduct {
          id
          databaseId
          name
          slug
          price
          description
          image {
            sourceUrl
            altText
          }
        }
      }
    }
  }
`;

interface SearchResult {
  id: string;
  databaseId: number;
  name: string;
  slug: string;
  price: string;
  description: string;
  image: {
    sourceUrl: string;
    altText: string;
  } | null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Search query must be at least 2 characters',
      products: [],
    });
  }

  const firstRaw = typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : 8;
  const first = Math.max(1, Math.min(48, Number.isFinite(firstRaw) ? firstRaw : 8));
  const after = typeof req.query.after === 'string' ? req.query.after : undefined;

  try {
    const client = getClient();
    const { data, errors } = await client.query({
      query: SEARCH_PRODUCTS,
      variables: { search: q, first, after: after || null },
      fetchPolicy: 'network-only',
    });

    if (errors && errors.length > 0) {
      console.error('[Search API] GraphQL errors:', errors);
    }

    const products: SearchResult[] = (data?.products?.nodes || []).map((product: any) => ({
      id: product.id,
      databaseId: product.databaseId,
      name: product.name,
      slug: product.slug,
      price: product.price || '',
      regularPrice: product.regularPrice || '',
      salePrice: product.salePrice || '',
      stockStatus: product.stockStatus || 'IN_STOCK',
      description: product.description || '',
      image: product.image
        ? {
            sourceUrl: product.image.sourceUrl,
            altText: product.image.altText || product.name,
          }
        : null,
    }));

    // Boost products whose name contains all search terms to the top
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length > 0) {
      products.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aMatch = terms.every((t) => aName.includes(t));
        const bMatch = terms.every((t) => bName.includes(t));
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    const pageInfo = data?.products?.pageInfo || {};

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      success: true,
      products,
      query: q,
      hasNextPage: pageInfo.hasNextPage || false,
      endCursor: pageInfo.endCursor || null,
    });
  } catch (error) {
    console.error('[Search API] Query failed');

    return res.status(500).json({
      success: false,
      message: 'Search failed',
      products: [],
    });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
