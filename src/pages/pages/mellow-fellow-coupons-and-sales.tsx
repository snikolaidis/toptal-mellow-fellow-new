import { GetStaticProps } from 'next';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import KlaviyoForm from '@/components/KlaviyoForm';
import DealsCardGrid, { DealCard } from '@/components/deals/DealsCardGrid';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';

const DEALS_FORM_ID = process.env.NEXT_PUBLIC_KLAVIYO_DEALS_FORM_ID;
 
const GET_DEALS_CARD_GRID = gql`
  query GetDealsCardGrid {
    pageBy(uri: "mellow-fellow-coupons-and-sales") {
      dealsPageCtas {
        dealCtas {
          label
          heading
          description
          visible
          image {
            node {
              sourceUrl
              altText
            }
          }
          collectionTarget {
            nodes {
              slug
            }
          }
        }
      }
    }
  }
`;

interface DealsPageProps {
  page: ContentPageData | null;
  cards: DealCard[];
}

export default function DealsPage({ page, cards }: DealsPageProps) {
  return (
    <Layout title={page?.title ?? 'Deals'} seo={page?.seo}>
      {page && <ContentPage page={page} />}

      <DealsCardGrid cards={cards} />

      {DEALS_FORM_ID && <KlaviyoForm formId={DEALS_FORM_ID} />}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<DealsPageProps> = async () => {
  try {
    const client = getClient();
    const [pageResult, ctasResult] = await Promise.all([
      client.query({
        query: GET_CONTENT_PAGE_BY_SLUG,
        variables: { slug: '/mellow-fellow-coupons-and-sales' },
      }),
      client.query({ query: GET_DEALS_CARD_GRID }).catch(() => ({ data: null })),
    ]);

    const rows = ctasResult.data?.pageBy?.dealsPageCtas?.dealCtas || [];
    const cards: DealCard[] = rows
      .filter((row: any) => row?.visible)
      .filter((row: any) => row?.collectionTarget?.nodes?.[0]?.slug)
      .map((row: any) => {
        const imageNode = row.image?.node;
        return {
          href: `/collections/${row.collectionTarget.nodes[0].slug}`,
          label: row.label,
          heading: row.heading ?? null,
          description: row.description ?? null,
          image: imageNode?.sourceUrl
            ? { src: imageNode.sourceUrl, alt: imageNode.altText ?? '' }
            : null,
        };
      });

    return {
      props: {
        page: pageResult.data?.page ?? null,
        cards,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching mellow-fellow-coupons-and-sales page:', error);
    return { props: { page: null, cards: [] }, revalidate: 60 };
  }
};
