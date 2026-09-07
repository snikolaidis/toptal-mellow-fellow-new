import '../../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { ApolloError, gql } from '@apollo/client';
import { GetStaticPaths, GetStaticProps } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
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

// Not a heuristic: Next assigns this before forking the workers that prerender
// pages, never assigns it in the server runtime, and branches on it itself.
const isBuildPhase = () => process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

const BUILD_FALLTHROUGH_REVALIDATE = 10;

// Two attempts rather than collections' three: a PDP render measures 4 to 11s
// against production, so a third would push a recoverable blip past the 30s
// Atlas ceiling and turn it into a hard timeout.
const RENDER_ATTEMPTS = 2;
const RENDER_DEADLINE_MS = 20_000;
const RETRY_BASE_MS = 250;
const RETRY_CAP_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffWithFullJitter(attempt: number): number {
  return Math.random() * Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
}

/**
 * An ApolloError carrying GraphQL errors but no network error is the document
 * being rejected at validation: a field the schema does not have, usually an ACF
 * group or taxonomy renamed in wp-admin. A second attempt gets the same
 * rejection, so it fails immediately rather than spending the deadline.
 */
function isDeterministic(error: unknown): boolean {
  return error instanceof ApolloError && error.graphQLErrors.length > 0 && !error.networkError;
}

async function withRenderRetry<T>(slug: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let lastError: Error = new Error('render never attempted');

  for (let attempt = 1; attempt <= RENDER_ATTEMPTS; attempt++) {
    const attemptStartedAt = Date.now();

    try {
      return await run();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (isDeterministic(error)) throw lastError;
    }

    if (attempt === RENDER_ATTEMPTS) break;

    const waitMs = backoffWithFullJitter(attempt);
    // The next attempt costs roughly what the last one did, which is the only
    // estimate available, so a render that already ran long does not get one.
    const projectedMs = Date.now() - startedAt + waitMs + (Date.now() - attemptStartedAt);

    if (projectedMs >= RENDER_DEADLINE_MS) {
      throw new Error(`${lastError.message} (deadline reached after ${attempt} attempt(s))`);
    }

    console.warn(
      `[Product] "${slug}": attempt ${attempt} of ${RENDER_ATTEMPTS} failed (${lastError.message}), retrying in ${Math.round(waitMs)}ms`
    );
    await sleep(waitMs);
  }

  throw lastError;
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
      withRenderRetry(slug, () => getWordPressProps({ ctx: seedCtx, revalidate: 60 })),
      fetchExtrasAndReviews(wpUrl, slug),
      fetchProductNutrition(slug),
      fetchFixedBundleItems(wpUrl, slug),
    ]);

    // The only evidence this route gets that WordPress genuinely has no such
    // product: `getWordPressProps` returns its own notFound when the seed query
    // succeeded and `nodeByUri` came back empty. Anything else throws instead.
    if (!('props' in result) || !result.props) {
      return result;
    }

    Object.assign(result.props, extras, { nutrition, reviewData, fixedBundleItems });
    mergeMenuState(result.props, menuClient);
    return result;
  } catch (error) {
    console.error(`[Product] failed to build "${slug}":`, error);

    // A throw at build time would fail the whole deploy, which is worse than one
    // product arriving late, so the build path leaves it to `fallback: 'blocking'`.
    if (isBuildPhase()) {
      return { notFound: true, revalidate: BUILD_FALLTHROUGH_REVALIDATE };
    }

    // Deliberately not `notFound`: ISR then keeps serving the last good copy
    // rather than pinning "this product does not exist" onto whichever instance
    // happened to render during the outage.
    throw error;
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
