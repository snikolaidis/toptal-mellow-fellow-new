import { GetStaticProps } from 'next';
import { gql } from '@apollo/client';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import { getClient } from '@/lib/apollo-client';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';
import DoublePointsDaily from '@/wp-blocks/DoublePointsDaily';
import CollectionGroup, { CollectionGroupItem } from '@/wp-blocks/CollectionGroup';
import {
  SIMPLE_PRODUCT_FIELDS,
  VARIABLE_PRODUCT_FIELDS,
  EXTERNAL_PRODUCT_FIELDS,
  GROUP_PRODUCT_FIELDS,
} from '@/graphql/queries/products';

const PAGE_SLUG = '/mellow-day-2026';

// List only the blocks actually used on this page. Add a line here whenever
// a new block type is added to the WP editor for this page — see the
// console warning in getStaticProps below if one is missing.
const GET_MELLOW_DAY_2026 = gql`
  ${blocks.AcfHeroSection.fragments.entry}
  ${blocks.AcfSaleCountdownHero.fragments.entry}
  ${blocks.CoreParagraph.fragments.entry}
  query GetMellowDay2026($slug: ID!) {
    page(id: $slug, idType: URI) {
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
        ...${blocks.AcfHeroSection.fragments.key}
        ...${blocks.AcfSaleCountdownHero.fragments.key}
        ...${blocks.CoreParagraph.fragments.key}
      }
    }
  }
`;

// Fetches products for all three collection tabs in a single request via
// GraphQL field aliases, matching the COLLECTION taxonomy filter pattern used
// in src/graphql/queries/collections.ts. Capped at 16 per collection (matching
// the Shopify grid cap from the original collection-group__divs.liquid snippet).
const GET_MELLOW_DAY_COLLECTIONS = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetMellowDay2026Collections {
    bestSellers: products(first: 16, where: {
      taxonomyFilter: {
        filters: [{ taxonomy: COLLECTION, terms: ["best-sellers"], operator: IN }]
      }
    }) {
      nodes {
        __typename
        ... on SimpleProduct { ...SimpleProductFields }
        ... on VariableProduct { ...VariableProductFields }
        ... on ExternalProduct { ...ExternalProductFields }
        ... on GroupProduct { ...GroupProductFields }
      }
    }
    edibles: products(first: 16, where: {
      taxonomyFilter: {
        filters: [{ taxonomy: COLLECTION, terms: ["edibles"], operator: IN }]
      }
    }) {
      nodes {
        __typename
        ... on SimpleProduct { ...SimpleProductFields }
        ... on VariableProduct { ...VariableProductFields }
        ... on ExternalProduct { ...ExternalProductFields }
        ... on GroupProduct { ...GroupProductFields }
      }
    }
    awardWinning: products(first: 16, where: {
      taxonomyFilter: {
        filters: [{ taxonomy: COLLECTION, terms: ["award-winning-products"], operator: IN }]
      }
    }) {
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

interface MellowDay2026PageProps {
  page: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    editorBlocks: any[];
  } | null;
  collectionGroups: CollectionGroupItem[];
}

export default function MellowDay2026Page({ page, collectionGroups }: MellowDay2026PageProps) {
  if (!page) return null;

  const hasBlocks = Array.isArray(page.editorBlocks) && page.editorBlocks.length > 0;

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
}

export const getStaticProps: GetStaticProps<MellowDay2026PageProps> = async () => {
  try {
    const client = getClient();

    const [wpResult, collectionResult] = await Promise.all([
      client.query({ query: GET_MELLOW_DAY_2026, variables: { slug: PAGE_SLUG } }),
      client.query({ query: GET_MELLOW_DAY_COLLECTIONS }),
    ]);

    if (!wpResult.data?.page) {
      return { notFound: true, revalidate: 60 };
    }

    // Dev-time safety net: warn (don't throw) if a block on this page has no
    // fields beyond the basics — almost always means its fragment hasn't
    // been added to GET_MELLOW_DAY_2026 above yet.
    if (process.env.NODE_ENV !== 'production') {
      const knownKeys = new Set(['name', '__typename', 'id', 'parentClientId']);
      for (const block of wpResult.data.page.editorBlocks ?? []) {
        const extraKeys = Object.keys(block).filter((k) => !knownKeys.has(k));
        if (extraKeys.length === 0) {
          console.warn(
            `[mellow-day-2026] Block "${block.name}" (${block.__typename}) has no queried fields — ` +
              `add its fragment to GET_MELLOW_DAY_2026 in src/pages/pages/mellow-day-2026.tsx.`,
          );
        }
      }
    }

    const cd = collectionResult.data;
    const collectionGroups: CollectionGroupItem[] = [
      { handle: 'best-sellers',           title: 'Best Sellers',  products: cd?.bestSellers?.nodes  ?? [] },
      { handle: 'edibles',                title: 'Edibles',       products: cd?.edibles?.nodes   ?? [] },
      { handle: 'award-winning-products', title: 'Award Winners', products: cd?.awardWinning?.nodes ?? [] },
    ];

    return {
      props: { page: wpResult.data.page, collectionGroups },
      revalidate: 60,
    };
  } catch (error) {
    // Transient WP error: regenerate on-demand rather than failing the build.
    console.error('Error fetching "mellow-day-2026" page:', error);
    return { notFound: true, revalidate: 60 };
  }
};
