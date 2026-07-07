import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';

/**
 * Dedicated template for the "Learn About Our Blends" page
 * (/pages/learn-about-our-blends). Faust prefers `page-learn-about-our-blends`
 * over the generic `page` template for that slug, so this renders the page's
 * typed editorBlocks via WordPressBlocksViewer (React components) instead of the
 * generic template's `renderedHtml` fallback.
 *
 * Blocks the page uses: the per-blend editorial callouts (AcfBlendCallout), the
 * "Explore the X Blend" product grids (AcfFeaturedCollection), and the intro
 * copy (CoreParagraph). CoreHeading is intentionally omitted: Faust's bundled
 * CoreHeading fragment requests `textAlign`, but the schema's
 * CoreHeadingAttributes exposes `align` — querying it errors the whole page
 * query (the same reason front-page / mellow-day avoid CoreHeading).
 */
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
      {hasBlocks ? (
        <WordPressBlocksViewer blocks={page.editorBlocks} />
      ) : (
        <h1>{page.title}</h1>
      )}
    </Layout>
  );
};

// The Blends page's editor blocks — each backend-managed section spreads its
// fragment here (manual/explicit; there is deliberately no auto-include).
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
