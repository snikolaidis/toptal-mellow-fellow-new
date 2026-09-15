import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import blocks from '@/wp-blocks';
import * as blockFragments from '@/wp-blocks/fragments';
import type { ContentPageData } from '@/types/mellow-fellow';

interface PageData {
  page?: ContentPageData | null;
}

const Page: FaustTemplate<PageData> = (props) => {
  const page = props.data?.page;
  if (!page) return null;

  return (
    <Layout title={page.title} seo={page.seo}>
      <ContentPage page={page} />
    </Layout>
  );
};

Page.query = gql`
  ${blockFragments.AcfFaq.entry}
  ${blockFragments.AcfUgcCarousel.entry}
  ${blockFragments.AcfPromoSlider.entry}
  ${blockFragments.AcfBlogPosts.entry}
  ${blockFragments.AcfReviewsCarousel.entry}
  ${blockFragments.AcfQuiz.entry}
  query GenericPage($id: ID!) {
    page(id: $id, idType: DATABASE_ID) {
      title
      slug
      editorBlocks(flat: false) {
        __typename
        renderedHtml
        ...AcfFaqFragment
        ...AcfUgcCarouselFragment
        ...AcfPromoSliderFragment
        ...AcfBlogPostsFragment
        ...AcfReviewsCarouselFragment
        ...AcfQuizFragment
      }
      seo {
        title
        metaDesc
      }
    }
  }
`;

Page.variables = (seedNode) => ({ id: seedNode.databaseId });

export default Page;
