import { GetStaticProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { gql } from '@apollo/client';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import blocks from '@/wp-blocks';
import * as blockFragments from '@/wp-blocks/fragments';
import { getClient } from '@/lib/apollo-client';
import Layout from '@/components/Layout';
import styles from '@/styles/pages/collections.module.css';

/**
 * /collections — the "Catalog" page (Shopify parity). Content is managed in
 * the WP page with slug `collections`: an ordered set of `acf/collection-links`
 * blocks (grid layout + section heading) rendered via WordPressBlocksViewer,
 * like the front page.
 */

interface CatalogPageData {
  title?: string | null;
  editorBlocks?: any[] | null;
  seo?: { title?: string | null; metaDesc?: string | null } | null;
}

interface CollectionsPageProps {
  page: CatalogPageData | null;
}

// Only the blocks this page supports are spread here (contained blast radius):
// collection-links sections, an optional reviews carousel, and paragraphs for
// intro copy. CoreHeading is deliberately excluded (known textAlign/align
// schema mismatch in the bundled fragment) — the h1 is hardcoded instead.
const GET_COLLECTIONS_CATALOG_PAGE = gql`
  ${blockFragments.AcfCollectionLinks.entry}
  ${blockFragments.AcfReviewsCarousel.entry}
  ${blockFragments.CoreParagraph.entry}
  query CollectionsCatalogPage($uri: ID!) {
    page(id: $uri, idType: URI) {
      title
      editorBlocks(flat: false) {
        name
        __typename
        id: clientId
        parentClientId
        ...${blockFragments.AcfCollectionLinks.key}
        ...${blockFragments.AcfReviewsCarousel.key}
        ...${blockFragments.CoreParagraph.key}
      }
      seo {
        title
        metaDesc
      }
    }
  }
`;

export default function CollectionsPage({ page }: CollectionsPageProps) {
  const seo = {
    title: page?.seo?.title ?? undefined,
    metaDesc: page?.seo?.metaDesc ?? undefined,
  };

  return (
    <Layout title="Collections" seo={seo}>
      <div className={styles.page}>
        <header className={styles.catalogHeader}>
          <h1 className={styles.catalogTitle}>Catalog</h1>
        </header>
        {page?.editorBlocks?.length ? (
          <WordPressBlocksViewer blocks={page.editorBlocks} />
        ) : null}
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<CollectionsPageProps> = async () => {
  try {
    const client = getClient();
    const [{ data }, menuClient] = await Promise.all([
      client.query({
        query: GET_COLLECTIONS_CATALOG_PAGE,
        variables: { uri: '/collections' },
      }),
      prefetchMenus(),
    ]);

    const props = { page: data?.page ?? null } as any;
    mergeMenuState(props, menuClient);

    return { props, revalidate: 60 };
  } catch (error) {
    console.error('Error fetching collections catalog page:', error);
    return {
      props: { page: null },
      revalidate: 60,
    };
  }
};
