import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import blocks from '@/wp-blocks';
import * as blockFragments from '@/wp-blocks/fragments';
import Layout from '@/components/Layout';
import { CollectionFilterProvider } from '@/context/CollectionFilterContext';

interface FrontPageData {
  page?: { editorBlocks?: any[] } | null;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';
const HOMEPAGE_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Mellow Fellow',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/Black_Logo_with_Gold.png` },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Mellow Fellow',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/shop?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: 'Mellow Fellow | Premium Cannabis Products',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#organization` },
      description: 'Premium cannabis products for elevated experiences.',
    },
  ],
});

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
        schema: HOMEPAGE_SCHEMA,
      }}
    >
      {/* Backend-managed homepage blocks (hero slider, image slider,
          highlights groups, collection links). */}
      {pageBlocks.length > 0 && (
        <CollectionFilterProvider>
          <WordPressBlocksViewer blocks={pageBlocks} />
        </CollectionFilterProvider>
      )}
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
  ${blockFragments.AcfQuizHero.entry}
  ${blockFragments.AcfShopByMood.entry}
  ${blockFragments.AcfSocialProofStrip.entry}
  ${blockFragments.AcfCategoryTabs.entry}
  ${blockFragments.AcfWhatSetsUsApart.entry}
  ${blockFragments.AcfLoyaltyTiers.entry}
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
        ...${blockFragments.AcfQuizHero.key}
        ...${blockFragments.AcfShopByMood.key}
        ...${blockFragments.AcfSocialProofStrip.key}
        ...${blockFragments.AcfCategoryTabs.key}
        ...${blockFragments.AcfWhatSetsUsApart.key}
        ...${blockFragments.AcfLoyaltyTiers.key}
        ...${blockFragments.CoreImage.key}
      }
    }
  }
`;

FrontPage.variables = (seedNode) => ({ id: seedNode.databaseId });

export default FrontPage;
