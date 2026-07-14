import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import blocks from '@/wp-blocks';
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
  ${blocks.AcfFaq.fragments.entry}
  ${blocks.AcfUgcCarousel.fragments.entry}
  ${blocks.AcfPromoSlider.fragments.entry}
  ${blocks.AcfBlogPosts.fragments.entry}
  ${blocks.AcfReviewsCarousel.fragments.entry}
  query GenericPage($id: ID!) {
    page(id: $id, idType: DATABASE_ID) {
      title
      slug
      editorBlocks(flat: false) {
        __typename
        renderedHtml
        ...${blocks.AcfFaq.fragments.key}
        ...${blocks.AcfUgcCarousel.fragments.key}
        ...${blocks.AcfPromoSlider.fragments.key}
        ...${blocks.AcfBlogPosts.fragments.key}
        ...${blocks.AcfReviewsCarousel.fragments.key}
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
