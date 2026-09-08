// Pulls recommendations from Rebuy then joins with Woo products by slug.
// Shopify handle == Woo slug since the migration kept the same handle.
// Params: product_id, product_ids (csv), shopper_id, limit (max 20).

import type { NextApiRequest, NextApiResponse } from 'next';
import { gql } from '@apollo/client';
import { getClient } from '@/lib/apollo-client';
import { getRecommendedProducts } from '@/lib/rebuy/client';
import { withRateLimitOnly } from '@/lib/middleware';
import type { Product } from '@/types/woocommerce';

const PRODUCTS_BY_SLUGS = gql`
  query RebuyProductsBySlugs($slugs: [String]) {
    products(first: 40, where: { slugIn: $slugs, status: "publish" }) {
      nodes {
        __typename
        ... on SimpleProduct {
          id
          databaseId
          name
          slug
          type
          price
          regularPrice
          salePrice
          stockStatus
          image { id sourceUrl altText }
          productCategories { nodes { id name slug } }
        }
        ... on VariableProduct {
          id
          databaseId
          name
          slug
          type
          price
          regularPrice
          salePrice
          stockStatus
          image { id sourceUrl altText }
          productCategories { nodes { id name slug } }
        }
        ... on ExternalProduct {
          id
          databaseId
          name
          slug
          type
          price
          regularPrice
          salePrice
          image { id sourceUrl altText }
          productCategories { nodes { id name slug } }
        }
        ... on GroupProduct {
          id
          databaseId
          name
          slug
          type
          price
          image { id sourceUrl altText }
          productCategories { nodes { id name slug } }
        }
      }
    }
  }
`;

function parseIds(raw: string | string[] | undefined): number[] {
  if (!raw) return [];
  const str = Array.isArray(raw) ? raw.join(',') : raw;
  return str
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed', products: [] });
  }

  try {
    const productIds = [
      ...parseIds(req.query.product_id),
      ...parseIds(req.query.product_ids),
    ];
    const shopperId = typeof req.query.shopper_id === 'string' ? req.query.shopper_id : undefined;
    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 4;
    const limit = Math.max(1, Math.min(20, Number.isFinite(limitRaw) ? limitRaw : 4));

    const rebuyProducts = await getRecommendedProducts({
      productIds: productIds.length ? productIds : undefined,
      shopperId,
      limit,
    });

    const slugs = rebuyProducts.map((p) => p.handle).filter(Boolean);
    if (slugs.length === 0) {
      return res.status(200).json({ success: true, products: [], count: 0 });
    }

    const client = getClient();
    const { data, errors } = await client.query({
      query: PRODUCTS_BY_SLUGS,
      variables: { slugs },
      fetchPolicy: 'network-only',
    });

    if (errors?.length) {
      console.error('[Rebuy API] GraphQL errors:', errors);
    }

    const wooBySlug = new Map<string, Product>();
    for (const node of data?.products?.nodes ?? []) {
      if (node?.slug) wooBySlug.set(node.slug, node as Product);
    }

    const products: Product[] = slugs
      .map((slug) => wooBySlug.get(slug))
      .filter((p): p is Product => !!p);

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, products, count: products.length });
  } catch (err) {
    console.error('[Rebuy API] Request failed');
    return res.status(500).json({ success: false, message: 'Recommendation service unavailable', products: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
