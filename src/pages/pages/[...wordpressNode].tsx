import '../../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';

/**
 * Catch-all for WP content pages served under `/pages/<slug>` (Shopify-style
 * URL structure). In SSG mode Faust's `getWordPressProps` builds the seed URL
 * from the catch-all params only — so `/pages/<slug>` resolves the WP node at
 * `/<slug>` and renders the matching `page-{slug}` or generic `page` template.
 *
 * Must use getStaticProps (not SSR): the seed URL is derived from params, not
 * the full `/pages/...` request path.
 */
export default function Page(props: any) {
  const router = useRouter();
  return <WordPressTemplate key={router.asPath} {...props} />;
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [menuClient, result] = await Promise.all([
        prefetchMenus(),
        getWordPressProps({ ctx, revalidate: 60 }),
      ]);
      if ('props' in result && result.props) mergeMenuState(result.props, menuClient);
      return result;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error('[Page] getWordPressProps failed after retries, serving fallback', err);
        return { props: {}, revalidate: 30 };
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  return { props: {}, revalidate: 30 };
};

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [],
  fallback: 'blocking',
});
