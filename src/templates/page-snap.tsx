import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';

interface SnapPageData {
  page?: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    editorBlocks: any[];
  } | null;
}

// Migration of the Shopify `mellowfellow.fun/pages/snap` page — each Shopify
// section becomes an ACF block below, added one at a time. Uses
// WordPressBlocksViewer (like front-page.tsx) instead of the generic `page`
// template's raw `renderedHtml`, since ACF blocks in `acf.mode: "preview"`
// don't return usable rendered HTML through GraphQL — they need their React
// component from `blocks`.
const SnapPage: FaustTemplate<SnapPageData> = (props) => {
  const page = props.data?.page;
  if (!page) return null;

  const hasBlocks = Array.isArray(page.editorBlocks) && page.editorBlocks.length > 0;

  return (
    <Layout title={page.title} seo={page.seo}>
      {hasBlocks ? <WordPressBlocksViewer blocks={page.editorBlocks} /> : <h1>{page.title}</h1>}
    </Layout>
  );
};

// NOTE: AcfCollectionCardsSet's fragment is intentionally NOT spread here yet.
// Its mu-plugin (block.json + acf-json field group) hasn't been deployed to
// WP, so the type doesn't exist in the live schema — GraphQL rejects the
// entire query document if it references an unknown type, which would also
// break the already-working AcfValuePropsSet section above. Add it once the
// block is confirmed live (see wp-schema-deploy-asymmetry project memory).
SnapPage.query = gql`
  ${blocks.AcfValuePropsSet.fragments.entry}
  query GetSnapPage($id: ID!) {
    page(id: $id, idType: DATABASE_ID) {
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
        ...${blocks.AcfValuePropsSet.fragments.key}
      }
    }
  }
`;

SnapPage.variables = (seedNode) => ({ id: seedNode.databaseId });

export default SnapPage;
