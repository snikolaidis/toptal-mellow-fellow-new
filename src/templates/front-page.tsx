import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import blocks from '@/wp-blocks';
import {
  SIMPLE_PRODUCT_FIELDS,
  VARIABLE_PRODUCT_FIELDS,
  EXTERNAL_PRODUCT_FIELDS,
  GROUP_PRODUCT_FIELDS,
} from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import FeaturedCollection from '@/components/FeaturedCollection';
import RebuyRecommendations from '@/components/RebuyRecommendations';
import CollectionCards from '@/components/CollectionCards';
import { Product } from '@/types/woocommerce';

interface FrontPageData {
  page?: { editorBlocks?: any[] } | null;
  products?: { nodes: Product[] };
}

const FrontPage: FaustTemplate<FrontPageData> = (props) => {
  const products = props.data?.products?.nodes ?? [];
  const pageBlocks = props.data?.page?.editorBlocks ?? [];

  const featuredProducts = products.slice(0, 8);
  const newArrivals = products.slice(8, 16);
  const awardedProducts = products.slice(16, 24);

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

      <FeaturedCollection products={awardedProducts} title="Award-Winning Products" />

      <CollectionCards
        title="Premium Smokable Devices"
        cards={[
          { id: 1, smallText: 'Smokeable Bundles', bigText: 'Enjoy 30% Off', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Smokeable_Bundle.webp' },
          { id: 2, smallText: 'Monthly Mystery Boxes', bigText: '30% Off Value', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Fam_Box.webp' },
          { id: 3, smallText: 'Edibles Bundles', bigText: 'Stock Up & Save', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Edible_Bundle.webp' },
          { id: 4, smallText: 'Smokeable Bundles', bigText: 'Enjoy 30% Off', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Smokeable_Bundle.webp' },
          { id: 5, smallText: 'Monthly Mystery Boxes', bigText: '30% Off Value', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Fam_Box.webp' },
          { id: 6, smallText: 'Edibles Bundles', bigText: 'Stock Up & Save', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Edible_Bundle.webp' }
        ]}
      />

      <div className="container">
        {/* Rebuy Recommendations */}
        <RebuyRecommendations title="Recommended for you" limit={8} gridClass="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6" />
      </div>
    </Layout>
  );
};

// Combined document: the front page's editor blocks (only the hero-slider
// fragment is spread — that's the one block this template renders) plus the
// products that feed the hardcoded homepage sections.
FrontPage.query = gql`
  ${blocks.AcfHeroSlider.fragments.entry}
  ${blocks.AcfCollectionLinks.fragments.entry}
  ${blocks.AcfCollectionSlider.fragments.entry}
  ${blocks.AcfImageSlider.fragments.entry}
  ${blocks.AcfHighlightsGroup.fragments.entry}
  ${blocks.AcfResponsiveImage.fragments.entry}
  ${blocks.AcfImageCarousel.fragments.entry}
  ${blocks.CoreImage.fragments.entry}
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query FrontPage($id: ID!, $first: Int = 24) {
    page(id: $id, idType: DATABASE_ID) {
      editorBlocks(flat: false) {
        name
        __typename
        id: clientId
        parentClientId
        ...${blocks.AcfHeroSlider.fragments.key}
        ...${blocks.AcfCollectionLinks.fragments.key}
        ...${blocks.AcfCollectionSlider.fragments.key}
        ...${blocks.AcfImageSlider.fragments.key}
        ...${blocks.AcfHighlightsGroup.fragments.key}
        ...${blocks.AcfResponsiveImage.fragments.key}
        ...${blocks.AcfImageCarousel.fragments.key}
        ...${blocks.CoreImage.fragments.key}
      }
    }
    products(first: $first, where: { status: "publish" }) {
      nodes {
        __typename
        ... on SimpleProduct { ...SimpleProductFields }
        ... on VariableProduct { ...VariableProductFields }
        ... on ExternalProduct { ...ExternalProductFields }
        ... on GroupProduct { ...GroupProductFields }
      }
    }
  }
`;

FrontPage.variables = (seedNode) => ({ id: seedNode.databaseId, first: 24 });

export default FrontPage;
