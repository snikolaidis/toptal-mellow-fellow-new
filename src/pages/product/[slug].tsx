import '../../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { GET_ALL_PRODUCT_SLUGS } from '@/graphql/queries/products';
import type { SingleProductExtras } from '@/templates/single-product';

/**
 * Route wrapper for single products. The page itself lives in
 * `src/templates/single-product.tsx` — Faust resolves the seed node from the
 * URI and picks that template off the `product` CPT's hierarchy.
 *
 * Note the URL asymmetry: public URLs stay at `/product/<slug>` (singular) while
 * WordPress's product permalink base is `/products/` (plural). Since
 * `getWordPressProps` derives the seed URI purely from `ctx.params.wordpressNode`
 * in SSG mode, the mapping is done by handing it a synthetic param below.
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
async function fetchProductExtras(wpUrl: string, slug: string): Promise<SingleProductExtras> {
  const empty: SingleProductExtras = {
    collectionName: null,
    collectionSlug: null,
    availableOptions: [],
    availableOptionsBase: '',
    bundleSlug: null,
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
    };
  } catch {
    return empty;
  }
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const slug = typeof ctx.params?.slug === 'string' ? ctx.params.slug : '';

  // Rewrite `/product/<slug>` to the WP permalink `/products/<slug>` for the
  // seed query — getWordPressProps reads `params.wordpressNode` only.
  const seedCtx = { ...ctx, params: { wordpressNode: ['products', slug] } };

  try {
    const [menuClient, result, extras] = await Promise.all([
      prefetchMenus(),
      getWordPressProps({ ctx: seedCtx, revalidate: 60 }),
      fetchProductExtras(wpUrl, slug),
    ]);

    if (!('props' in result) || !result.props) {
      return result;
    }

    Object.assign(result.props, extras);
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
