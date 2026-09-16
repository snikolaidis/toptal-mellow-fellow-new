import '../../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { ApolloError } from '@apollo/client';
import { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import { isBuildPhase, warmWordPress } from '@/lib/buildPhase';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { GET_ALL_PRODUCT_SLUGS } from '@/graphql/queries/products';
import type { SingleProductExtras } from '@/templates/single-product';
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
 * Everything this route adds to the template props comes from `mf/v1/product`,
 * which already resolves the product in PHP. A failure is non-fatal: the core
 * product data comes from the template's own GraphQL query.
 */
async function fetchProductExtras(
  wpUrl: string,
  slug: string
): Promise<Omit<SingleProductExtras, 'reviewData'> & { databaseId: number | null }> {
  const empty = {
    collectionName: null,
    collectionSlug: null,
    availableOptions: [],
    availableOptionsBase: '',
    nutrition: null,
    topCannabinoids: [],
    allergens: null,
    taxonomies: {},
    fixedBundleItems: [],
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
      nutrition: json.nutrition || null,
      topCannabinoids: json.topCannabinoids || [],
      allergens: json.allergens || null,
      taxonomies: json.taxonomies || {},
      // Empty for "mystery" on purpose: the endpoint withholds those contents.
      fixedBundleItems: json.fixedBundleItems || [],
      // Carried out of the same response purely to key the Klaviyo lookup,
      // then stripped off before the props are handed to the template.
      databaseId: json.product?.databaseId ?? null,
    };
  } catch {
    return empty;
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

const BUILD_FALLTHROUGH_REVALIDATE = 10;

// Runtime is bounded by the 30s Atlas ceiling: a PDP render measures 4 to 11s
// against production, so a third attempt would push a recoverable blip past
// it and turn it into a hard timeout.
const RUNTIME_RENDER_ATTEMPTS = 2;
const RUNTIME_RENDER_DEADLINE_MS = 20_000;

// The build issues no Atlas request, so the 30s ceiling does not apply: the
// only limit is Next's own staticPageGenerationTimeout, 120s in
// next.config.js. Spending the runtime budget here is what let a cold
// backend bake a 404 into the build output for the first pages prerendered.
const BUILD_RENDER_ATTEMPTS = 4;
const BUILD_RENDER_DEADLINE_MS = 90_000;
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
  const buildPhase = isBuildPhase();
  const maxAttempts = buildPhase ? BUILD_RENDER_ATTEMPTS : RUNTIME_RENDER_ATTEMPTS;
  const deadlineMs = buildPhase ? BUILD_RENDER_DEADLINE_MS : RUNTIME_RENDER_DEADLINE_MS;
  const startedAt = Date.now();
  let lastError: Error = new Error('render never attempted');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartedAt = Date.now();

    try {
      return await run();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (isDeterministic(error)) throw lastError;
    }

    if (attempt === maxAttempts) break;

    const waitMs = backoffWithFullJitter(attempt);
    // The next attempt costs roughly what the last one did, which is the only
    // estimate available, so a render that already ran long does not get one.
    const projectedMs = Date.now() - startedAt + waitMs + (Date.now() - attemptStartedAt);

    if (projectedMs >= deadlineMs) {
      throw new Error(`${lastError.message} (deadline reached after ${attempt} attempt(s))`);
    }

    console.warn(
      `[Product] "${slug}": attempt ${attempt} of ${maxAttempts} failed (${lastError.message}), retrying in ${Math.round(waitMs)}ms`
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
    const [menuClient, result, { extras, reviewData }] = await Promise.all([
      prefetchMenus(),
      withRenderRetry(slug, () => getWordPressProps({ ctx: seedCtx, revalidate: 60 })),
      fetchExtrasAndReviews(wpUrl, slug),
    ]);

    // The only evidence this route gets that WordPress genuinely has no such
    // product: `getWordPressProps` returns its own notFound when the seed query
    // succeeded and `nodeByUri` came back empty. Anything else throws instead.
    if (!('props' in result) || !result.props) {
      return result;
    }

    Object.assign(result.props, extras, { reviewData });
    mergeMenuState(result.props, menuClient);
    return result;
  } catch (error) {
    console.error(`[Product] failed to build "${slug}":`, error);

    // A throw here would fail the whole deploy, so the build phase records a
    // notFound. That does not defer to `fallback: 'blocking'`: the path is in
    // the prerender manifest, so the 404 is baked in, served until a
    // revalidation succeeds, and re-armed by every failed one.
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
  // Before the slug query, not after: that query has no retry of its own.
  await warmWordPress();

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
