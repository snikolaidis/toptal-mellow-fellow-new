import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import blocks from '@/wp-blocks';
import * as blockFragments from '@/wp-blocks/fragments';
import Layout from '@/components/Layout';

interface FrontPageData {
  page?: { editorBlocks?: any[] } | null;
}

const FrontPage: FaustTemplate<FrontPageData> = (props) => {
  const pageBlocks = props.data?.page?.editorBlocks ?? [];

  return (
    <Layout
      title="Home"
      description="Mellow Fellow - Premium cannabis products for elevated experiences. Shop disposable vapes, edibles, flower, cartridges and more."
      seo={{
        title: 'Mellow Fellow | Premium Cannabis Products',
        metaDesc: 'Mellow Fellow - Premium cannabis products for elevated experiences. Shop disposable vapes, edibles, flower, cartridges and more.',
        opengraphTitle: 'Mellow Fellow | Premium Cannabis Products',
        opengraphDescription: 'Premium cannabis products for elevated experiences. Shop disposable vapes, edibles, flower, cartridges and more.',
        schema: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${process.env.NEXT_PUBLIC_SITE_URL || ''}/#organization`,
              name: 'Mellow Fellow',
              url: process.env.NEXT_PUBLIC_SITE_URL || '',
              logo: {
                '@type': 'ImageObject',
                url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/Black_Logo_with_Gold.png`,
              },
            },
            {
              '@type': 'WebSite',
              '@id': `${process.env.NEXT_PUBLIC_SITE_URL || ''}/#website`,
              url: process.env.NEXT_PUBLIC_SITE_URL || '',
              name: 'Mellow Fellow',
              publisher: { '@id': `${process.env.NEXT_PUBLIC_SITE_URL || ''}/#organization` },
              potentialAction: {
                '@type': 'SearchAction',
                target: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/shop?search={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@type': 'WebPage',
              '@id': `${process.env.NEXT_PUBLIC_SITE_URL || ''}/#webpage`,
              url: process.env.NEXT_PUBLIC_SITE_URL || '',
              name: 'Mellow Fellow | Premium Cannabis Products',
              isPartOf: { '@id': `${process.env.NEXT_PUBLIC_SITE_URL || ''}/#website` },
              about: { '@id': `${process.env.NEXT_PUBLIC_SITE_URL || ''}/#organization` },
              description: 'Premium cannabis products for elevated experiences.',
            },
          ],
        }),
      }}
    >
      {/* Backend-managed homepage blocks (hero slider, image slider,
          highlights groups, collection links). */}
      {pageBlocks.length > 0 && <WordPressBlocksViewer blocks={pageBlocks} />}
    </Layout>
  );
};

// The front page's editor blocks — every backend-managed section spreads its
// fragment here. Product-driven blocks (collection slider / featured
// collection) fetch their own products client-side.
FrontPage.query = gql`
  ${blockFragments.AcfHeroSlider.entry}
  ${blockFragments.AcfCollectionLinks.entry}
  ${blockFragments.AcfCollectionSlider.entry}
  ${blockFragments.AcfImageSlider.entry}
  ${blockFragments.AcfHighlightsGroup.entry}
  ${blockFragments.AcfResponsiveImage.entry}
  ${blockFragments.AcfImageCarousel.entry}
  ${blockFragments.AcfFeaturedCollection.entry}
  ${blockFragments.AcfUgcCarousel.entry}
  ${blockFragments.AcfBlogPosts.entry}
  ${blockFragments.AcfFaq.entry}
  ${blockFragments.AcfReviewsCarousel.entry}
  ${blockFragments.AcfPromoSlider.entry}
  ${blockFragments.CoreImage.entry}
  query FrontPage($id: ID!) {
    page(id: $id, idType: DATABASE_ID) {
      editorBlocks(flat: false) {
        name
        __typename
        id: clientId
        parentClientId
        ...${blockFragments.AcfHeroSlider.key}
        ...${blockFragments.AcfCollectionLinks.key}
        ...${blockFragments.AcfCollectionSlider.key}
        ...${blockFragments.AcfImageSlider.key}
        ...${blockFragments.AcfHighlightsGroup.key}
        ...${blockFragments.AcfResponsiveImage.key}
        ...${blockFragments.AcfImageCarousel.key}
        ...${blockFragments.AcfFeaturedCollection.key}
        ...${blockFragments.AcfUgcCarousel.key}
        ...${blockFragments.AcfBlogPosts.key}
        ...${blockFragments.AcfFaq.key}
        ...${blockFragments.AcfReviewsCarousel.key}
        ...${blockFragments.AcfPromoSlider.key}
        ...${blockFragments.CoreImage.key}
      }
    }
  }
`;

FrontPage.variables = (seedNode) => ({ id: seedNode.databaseId });

export default FrontPage;
