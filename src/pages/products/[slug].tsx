import '../../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { GET_ALL_PRODUCT_SLUGS } from '@/graphql/queries/products';
import type { SingleProductExtras } from '@/templates/single-product';
import type { Product, ProductNutrition } from '@/types/woocommerce';
import { fetchKlaviyoReviews, type KlaviyoReviewsResult } from '@/lib/klaviyo-reviews';

/**
 * Route wrapper for single products. The page itself lives in
 * `src/templates/single-product.tsx` — Faust resolves the seed node from the
 * URI and picks that template off the `product` CPT's hierarchy.
 *
 * Public URLs match WordPress's product permalink base, `/products/<slug>`.
 * That doesn't make the seed mapping below redundant, though: in SSG mode
 * `getWordPressProps` derives the seed URI purely from `ctx.params.wordpressNode`
 * — it never reads `params.slug` — so the synthetic param is still required
 * even though the two paths now agree.
 */
export default function ProductRoute(props: Record<string, unknown>) {
  const router = useRouter();
  return <WordPressTemplate key={router.asPath} {...props} />;
}

/**
 * Sibling options, collection and bundle resolution are all derived in PHP by
 * the `mf/v1/product` endpoint and have no clean WPGraphQL equivalent, so they
 * are fetched here and passed to the template as extra props. A failure is
 * non-fatal: the core product data comes from the template's own GraphQL query.
 */
async function fetchProductExtras(
  wpUrl: string,
  slug: string
): Promise<Omit<SingleProductExtras, 'nutrition' | 'reviewData' | 'fixedBundleItems'> & { databaseId: number | null }> {
  const empty = {
    collectionName: null,
    collectionSlug: null,
    availableOptions: [],
    availableOptionsBase: '',
    bundleSlug: null,
    databaseId: null,
  };

  try {
    const res = await fetch(`${wpUrl}/wp-json/mf/v1/product?slug=${encodeURIComponent(slug)}`);
    const json = await res.json();
    if (!json?.success) return empty;
    return {
      collectionName: json.collectionName || null,
      collectionSlug: json.collectionSlug || null,
      availableOptions: json.availableOptions || [],
      availableOptionsBase: json.availableOptionsBase || '',
      bundleSlug: json.bundleSlug || null,
      // Carried out of the same response purely to key the Klaviyo lookup —
      // stripped off before the props are handed to the template.
      databaseId: json.product?.databaseId ?? null,
    };
  } catch {
    return empty;
  }
}

async function fetchProductNutrition(wpUrl: string, slug: string): Promise<ProductNutrition | null> {
  const query = `
    query GetProductNutrition($slug: ID!) {
      product(id: $slug, idType: SLUG) {
        ... on SimpleProduct { nutrition { calories sugar } }
        ... on VariableProduct { nutrition { calories sugar } }
      }
    }
  `;

  try {
    const res = await fetch(`${wpUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { slug } }),
    });
    const json = await res.json();
    if (json?.errors) return null;
    return json?.data?.product?.nutrition ?? null;
  } catch {
    return null;
  }
}

export interface ResolvedFixedBundleItem {
  productId: number;
  quantity: number;
  product?: Product;
}

/**
 * Fixed bundles have no picker — the admin-picked line items (bbFixedItems:
 * just productId + quantity) need resolving into full product records for
 * the "What's included" list. Doing that here at build/ISR time (instead of
 * a client-side fetch after hydration, as this used to work) means visitors
 * see the section immediately instead of watching it pop in.
 */
async function fetchFixedBundleItems(wpUrl: string, slug: string): Promise<ResolvedFixedBundleItem[]> {
  const modeQuery = `
    query GetFixedBundleMode($slug: ID!) {
      product(id: $slug, idType: SLUG) {
        ... on SimpleProduct { bbBundleMode bbFixedItems { productId quantity } }
        ... on VariableProduct { bbBundleMode bbFixedItems { productId quantity } }
      }
    }
  `;

  try {
    const res = await fetch(`${wpUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: modeQuery, variables: { slug } }),
    });
    const json = await res.json();
    const p = json?.data?.product;
    const items: Array<{ productId: number; quantity: number }> =
      p?.bbBundleMode === 'fixed' ? p.bbFixedItems || [] : [];
    if (items.length === 0) return [];

    const ids = items.map((i) => i.productId);
    const itemsQuery = `
      query GetFixedBundleItemProducts($ids: [Int]!) {
        products(first: 100, where: { include: $ids }) {
          nodes {
            __typename
            ... on SimpleProduct { databaseId name slug price regularPrice image { sourceUrl altText } }
            ... on VariableProduct { databaseId name slug price regularPrice image { sourceUrl altText } }
          }
        }
      }
    `;
    const res2 = await fetch(`${wpUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: itemsQuery, variables: { ids } }),
    });
    const json2 = await res2.json();
    const nodes: Product[] = json2?.data?.products?.nodes || [];
    const byId = new Map(nodes.map((n) => [n.databaseId, n]));
    return items.map((item) => ({ ...item, product: byId.get(item.productId) }));
  } catch {
    return [];
  }
}

const EMPTY_REVIEWS: KlaviyoReviewsResult = {
  summary: { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  reviews: [],
};

async function fetchExtrasAndReviews(wpUrl: string, slug: string) {
  const { databaseId, ...extras } = await fetchProductExtras(wpUrl, slug);
  const reviewData = databaseId ? await fetchKlaviyoReviews(databaseId) : EMPTY_REVIEWS;
  return { extras, reviewData };
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const slug = typeof ctx.params?.slug === 'string' ? ctx.params.slug : '';

  // getWordPressProps reads `params.wordpressNode` only (not `params.slug`),
  // so the seed URI still has to be built explicitly even though it matches
  // the public path.
  const seedCtx = { ...ctx, params: { wordpressNode: ['products', slug] } };

  try {
    const [menuClient, result, { extras, reviewData }, nutrition, fixedBundleItems] = await Promise.all([
      prefetchMenus(),
      getWordPressProps({ ctx: seedCtx, revalidate: 60 }),
      fetchExtrasAndReviews(wpUrl, slug),
      fetchProductNutrition(wpUrl, slug),
      fetchFixedBundleItems(wpUrl, slug),
    ]);

    if (!('props' in result) || !result.props) {
      return result;
    }

    Object.assign(result.props, extras, { nutrition, reviewData, fixedBundleItems });
    mergeMenuState(result.props, menuClient);
    return result;
  } catch (error) {
    console.error('[Product] getWordPressProps failed:', error);
    return { notFound: true, revalidate: 30 };
  }
};

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({ query: GET_ALL_PRODUCT_SLUGS });

    const paths =
      data?.products?.nodes?.map((product: { slug: string }) => ({
        params: { slug: product.slug },
      })) || [];

    return { paths, fallback: 'blocking' };
  } catch (error) {
    console.error('Error fetching product slugs:', error);
    return { paths: [], fallback: 'blocking' };
  }
};
