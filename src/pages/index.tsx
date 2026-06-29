import '../../faust.config';
import { WordPressTemplate, getWordPressProps } from '@faustwp/core';
import { GetStaticProps } from 'next';

/**
 * Front-page route. Faust resolves `/` to the WP static front page (seed node)
 * and renders the `front-page` template from `src/templates`.
 */
export default function Page(props: any) {
  return <WordPressTemplate {...props} />;
}

export const getStaticProps: GetStaticProps = (ctx) =>
  getWordPressProps({ ctx, revalidate: 60 });
