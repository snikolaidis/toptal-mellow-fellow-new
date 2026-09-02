import '../../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { gql } from '@apollo/client';
import { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { GET_ALL_PRODUCT_SLUGS } from '@/graphql/queries/products';
import type { SingleProductExtras } from '@/templates/single-product';
import type { ProductNutrition } from '@/types/woocommerce';
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
): Promise<Omit<SingleProductExtras, 'nutrition' | 'reviewData'> & { databaseId: number | null }> {
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

// Its own document on purpose: `nutrition` exists on SimpleProduct and VariableProduct
// only, so folding it into the four-type shared fragments 404s every product page.
const GET_PRODUCT_NUTRITION = gql`
  query GetProductNutrition($slug: ID!) {
    product(id: $slug, idType: SLUG) {
      ... on SimpleProduct { nutrition { calories sugar } }
      ... on VariableProduct { nutrition { calories sugar } }
    }
  }
`;

type ProductNutritionResult = {
  product?: { nutrition?: ProductNutrition | null } | null;
};

async function fetchProductNutrition(slug: string): Promise<ProductNutrition | null> {
  try {
    const { data, errors } = await getClient().query<ProductNutritionResult>({
      query: GET_PRODUCT_NUTRITION,
      variables: { slug },
      // Required, not an optimisation: the cache sets keyFields ['databaseId'] on
      // these types, this query omits it, and normalising throws into the catch below.
      fetchPolicy: 'no-cache',
    });
    if (errors?.length) return null;
    return data?.product?.nutrition ?? null;
  } catch {
    return null;
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
    const [menuClient, result, { extras, reviewData }, nutrition] = await Promise.all([
      prefetchMenus(),
      getWordPressProps({ ctx: seedCtx, revalidate: 60 }),
      fetchExtrasAndReviews(wpUrl, slug),
      fetchProductNutrition(slug),
    ]);

    if (!('props' in result) || !result.props) {
      return result;
    }

    Object.assign(result.props, extras, { nutrition, reviewData });
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
