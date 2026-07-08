import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';

interface LearnAboutCannabinoidsData {
  page?: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    editorBlocks: any[];
  } | null;
}

const PageLearnAboutCannabinoids: FaustTemplate<LearnAboutCannabinoidsData> = (props) => {
  const page = props.data?.page;
  if (!page) return null;

  const hasBlocks = Array.isArray(page.editorBlocks) && page.editorBlocks.length > 0;

  return (
    <Layout title={page.title} seo={page.seo}>
      <div className="learn-cannabinoids-page">
        <div className="learn-cannabinoids-page__intro">
          <h2 className="learn-cannabinoids-page__heading">Learn About Cannabinoids</h2>
        </div>
        {hasBlocks ? (
          <WordPressBlocksViewer blocks={page.editorBlocks} />
        ) : (
          <h1>{page.title}</h1>
        )}
      </div>
    </Layout>
  );
};

PageLearnAboutCannabinoids.query = gql`
  ${blocks.AcfCannabinoidCallout.fragments.entry}
  ${blocks.CoreParagraph.fragments.entry}
  query GetLearnAboutCannabinoids($id: ID!) {
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
        ...${blocks.AcfCannabinoidCallout.fragments.key}
        ...${blocks.CoreParagraph.fragments.key}
      }
    }
  }
`;

PageLearnAboutCannabinoids.variables = (seedNode) => ({ id: seedNode.databaseId });

export default PageLearnAboutCannabinoids;
