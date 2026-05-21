/**
 * Product Search API Endpoint
 *
 * Searches WooCommerce products via GraphQL and returns matching results
 * for the predictive search modal.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';

// Search query - uses WPGraphQL WooCommerce search parameter
const SEARCH_PRODUCTS = gql`
  query SearchProducts($search: String!, $first: Int = 6) {
    products(
      first: $first
      where: { search: $search, status: "publish" }
    ) {
      nodes {
        __typename
        ... on SimpleProduct {
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
        ... on VariableProduct {
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

export default async function handler(
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

  try {
    const client = getClient();
    const { data, errors } = await client.query({
      query: SEARCH_PRODUCTS,
      variables: { search: q, first: 6 },
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
      description: product.description || '',
      image: product.image
        ? {
            sourceUrl: product.image.sourceUrl,
            altText: product.image.altText || product.name,
          }
        : null,
    }));

    // Set cache headers for performance
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      success: true,
      products,
      query: q,
    });
  } catch (error) {
    console.error('[Search API] Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Search failed',
      products: [],
    });
  }
}
