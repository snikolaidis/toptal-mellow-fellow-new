import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';

interface LearnAboutOurBlendsData {
  page?: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    editorBlocks: any[];
  } | null;
}

const PageLearnAboutOurBlends: FaustTemplate<LearnAboutOurBlendsData> = (props) => {
  const page = props.data?.page;
  if (!page) return null;

  const hasBlocks = Array.isArray(page.editorBlocks) && page.editorBlocks.length > 0;

  return (
    <Layout title={page.title} seo={page.seo}>
      <div className="learn-blends-page">
        <h2>The Science Behind Mellow Fellow Blends: Synergy and Consistency</h2>
        {hasBlocks ? (
          <WordPressBlocksViewer blocks={page.editorBlocks} />
        ) : (
          <h1>{page.title}</h1>
        )}
      </div>
    </Layout>
  );
};

PageLearnAboutOurBlends.query = gql`
  ${blocks.AcfBlendCallout.fragments.entry}
  ${blocks.AcfFeaturedCollection.fragments.entry}
  ${blocks.CoreParagraph.fragments.entry}
  query GetLearnAboutOurBlends($id: ID!) {
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
        ...${blocks.AcfBlendCallout.fragments.key}
        ...${blocks.AcfFeaturedCollection.fragments.key}
        ...${blocks.CoreParagraph.fragments.key}
      }
    }
  }
`;

PageLearnAboutOurBlends.variables = (seedNode) => ({ id: seedNode.databaseId });

export default PageLearnAboutOurBlends;
