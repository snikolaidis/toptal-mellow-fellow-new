import { GetStaticProps } from 'next';
import { gql } from '@apollo/client';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import { getClient } from '@/lib/apollo-client';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';

const PAGE_SLUG = '/mellow-day-2026';

// List only the blocks actually used on this page. Add a line here whenever
// a new block type is added to the WP editor for this page — see the
// console warning in getStaticProps below if one is missing.
const GET_MELLOW_DAY_2026 = gql`
  ${blocks.AcfHeroSection.fragments.entry}
  ${blocks.CoreParagraph.fragments.entry}
  query GetMellowDay2026($slug: ID!) {
    page(id: $slug, idType: URI) {
      title
      seo {
        title
        metaDesc
      }
      editorBlocks(flat: false) {
        name
        __typename
        id: clientId
        parentClientId
        ...${blocks.AcfHeroSection.fragments.key}
        ...${blocks.CoreParagraph.fragments.key}
      }
    }
  }
`;

interface MellowDay2026PageProps {
  page: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    editorBlocks: any[];
  } | null;
}

export default function MellowDay2026Page({ page }: MellowDay2026PageProps) {
  if (!page) return null;

  const hasBlocks = Array.isArray(page.editorBlocks) && page.editorBlocks.length > 0;

  return (
    <Layout title={page.title} seo={page.seo}>
      {hasBlocks ? (
        <WordPressBlocksViewer blocks={page.editorBlocks} />
      ) : (
        <h1>{page.title}</h1>
      )}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<MellowDay2026PageProps> = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_MELLOW_DAY_2026,
      variables: { slug: PAGE_SLUG },
    });

    if (!data?.page) {
      return { notFound: true, revalidate: 60 };
    }

    // Dev-time safety net: warn (don't throw) if a block on this page has no
    // fields beyond the basics — almost always means its fragment hasn't
    // been added to GET_MELLOW_DAY_2026 above yet.
    if (process.env.NODE_ENV !== 'production') {
      const knownKeys = new Set(['name', '__typename', 'id', 'parentClientId']);
      for (const block of data.page.editorBlocks ?? []) {
        const extraKeys = Object.keys(block).filter((k) => !knownKeys.has(k));
        if (extraKeys.length === 0) {
          console.warn(
            `[mellow-day-2026] Block "${block.name}" (${block.__typename}) has no queried fields — ` +
              `add its fragment to GET_MELLOW_DAY_2026 in src/pages/pages/mellow-day-2026.tsx.`,
          );
        }
      }
    }

    return {
      props: { page: data.page },
      revalidate: 60,
    };
  } catch (error) {
    // Transient WP error: regenerate on-demand rather than failing the build.
    console.error('Error fetching "mellow-day-2026" page:', error);
    return { notFound: true, revalidate: 60 };
  }
};
