import '../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { GetStaticProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';

/**
 * Front-page route. Faust resolves `/` to the WP static front page (seed node)
 * and renders the `front-page` template from `src/templates`.
 */
export default function Page(props: any) {
  return <WordPressTemplate {...props} />;
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
        console.error('[Home] getWordPressProps failed after retries, serving fallback', err);
        return { props: {}, revalidate: 30 };
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  return { props: {}, revalidate: 30 };
};
