import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';
import * as blockFragments from '@/wp-blocks/fragments';
import DoublePointsDaily from '@/wp-blocks/DoublePointsDaily';
import CollectionGroup, { CollectionGroupItem } from '@/wp-blocks/CollectionGroup';
import { Product } from '@/types/woocommerce';
import { PRODUCT_FIELDS } from '@/graphql/queries/products';

interface MellowDay2026Data {
  page?: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    editorBlocks: any[];
  } | null;
  bestSellers?: { nodes: Product[] };
  edibles?: { nodes: Product[] };
  awardWinning?: { nodes: Product[] };
}

const MellowDay2026: FaustTemplate<MellowDay2026Data> = (props) => {
  const page = props.data?.page;
  if (!page) return null;

  const hasBlocks = Array.isArray(page.editorBlocks) && page.editorBlocks.length > 0;

  const collectionGroups: CollectionGroupItem[] = [
    { handle: 'best-sellers',           title: 'Best Sellers',  products: props.data?.bestSellers?.nodes  ?? [] },
    { handle: 'edibles',                title: 'Edibles',       products: props.data?.edibles?.nodes      ?? [] },
    { handle: 'award-winning-products', title: 'Award Winners', products: props.data?.awardWinning?.nodes ?? [] },
  ];

  return (
    <Layout title={page.title} seo={page.seo}>
      {hasBlocks ? (
        <WordPressBlocksViewer blocks={page.editorBlocks} />
      ) : (
        <h1>{page.title}</h1>
      )}

      {/* Hardcoded for now — copied verbatim from the live Shopify page.
          To be replaced by a real ACF block (AcfDoublePointsDaily) later. */}
      <DoublePointsDaily />

      <CollectionGroup collections={collectionGroups} />
    </Layout>
  );
};

// Single combined document: the page's typed editorBlocks (capped to the blocks
// actually used on this page) plus the three collection-group product lists via
// GraphQL field aliases (COLLECTION taxonomy filter, capped at 16 each).
MellowDay2026.query = gql`
  ${blockFragments.AcfHeroSection.entry}
  ${blockFragments.AcfSaleCountdownHero.entry}
  ${blockFragments.CoreParagraph.entry}
  ${PRODUCT_FIELDS}
  query GetMellowDay2026($id: ID!) {
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
        ...${blockFragments.AcfHeroSection.key}
        ...${blockFragments.AcfSaleCountdownHero.key}
        ...${blockFragments.CoreParagraph.key}
      }
    }
    bestSellers: products(first: 16, where: {
      taxonomyFilter: { filters: [{ taxonomy: COLLECTION, terms: ["best-sellers"], operator: IN }] }
    }) {
      nodes {
        __typename
        ...ProductFields
      }
    }
    edibles: products(first: 16, where: {
      taxonomyFilter: { filters: [{ taxonomy: COLLECTION, terms: ["edibles"], operator: IN }] }
    }) {
      nodes {
        __typename
        ...ProductFields
      }
    }
    awardWinning: products(first: 16, where: {
      taxonomyFilter: { filters: [{ taxonomy: COLLECTION, terms: ["award-winning-products"], operator: IN }] }
    }) {
      nodes {
        __typename
        ...ProductFields
      }
    }
  }
`;

MellowDay2026.variables = (seedNode) => ({ id: seedNode.databaseId });

export default MellowDay2026;
