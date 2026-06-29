import { GetStaticProps } from 'next';
import Link from 'next/link';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import KlaviyoForm from '@/components/KlaviyoForm';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';

const DEALS_FORM_ID = process.env.NEXT_PUBLIC_KLAVIYO_DEALS_FORM_ID;

const GET_DEALS_CTAS = gql`
  query GetDealsCtas {
    pageBy(uri: "mellow-fellow-coupons-and-sales") {
      dealsPageCtas {
        dealCtas {
          label
          collectionTarget {
            nodes {
              slug
              name
            }
          }
        }
      }
    }
  }
`;

interface Offer {
  href: string;
  label: string;
}

interface DealsPageProps {
  page: ContentPageData | null;
  offers: Offer[];
}

export default function DealsPage({ page, offers }: DealsPageProps) {
  return (
    <Layout title={page?.title ?? 'Deals'} seo={page?.seo}>
      {page && <ContentPage page={page} />}

      <div className="buttons">
        {offers.map((offer) => (
          <Link key={offer.href} href={offer.href} className="btn-primary">
            {offer.label}
          </Link>
        ))}
      </div>

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
      client.query({ query: GET_DEALS_CTAS }).catch(() => ({ data: null })),
    ]);

    const rows = ctasResult.data?.pageBy?.dealsPageCtas?.dealCtas || [];
    const offers: Offer[] = rows
      .filter((row: any) => row?.collectionTarget?.nodes?.[0]?.slug)
      .map((row: any) => ({
        href: `/collections/${row.collectionTarget.nodes[0].slug}`,
        label: row.label,
      }));

    return {
      props: {
        page: pageResult.data?.page ?? null,
        offers,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching mellow-fellow-coupons-and-sales page:', error);
    return { props: { page: null, offers: [] }, revalidate: 60 };
  }
};
