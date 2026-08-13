import { GetStaticProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';
import KlaviyoForm from '@/components/KlaviyoForm';
import DealsCardGrid, { DealCard } from '@/components/deals/DealsCardGrid';
import DealsHero, { DealsHeroProps } from '@/components/deals/DealsHero';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';

const DEALS_FORM_ID = process.env.NEXT_PUBLIC_KLAVIYO_DEALS_FORM_ID;
 
const GET_DEALS_CARD_GRID = gql`
  query GetDealsCardGrid {
    pageBy(uri: "mellow-fellow-coupons-and-sales") {
      dealsPageCtas {
        heroEyebrow
        heroHeading
        heroSubtitle
        dealCtas {
          label
          heading
          body
          visible
          image {
            node {
              sourceUrl
              altText
            }
          }
          dealLink {
            url
            title
            target
          }
        }
      }
    }
  }
`;

interface DealsPageProps {
  page: ContentPageData | null;
  cards: DealCard[];
  hero: DealsHeroProps;
}

export default function DealsPage({ page, cards, hero }: DealsPageProps) {
  return (
    <Layout title={page?.title ?? 'Deals'} seo={page?.seo}>
      <DealsHero eyebrow={hero.eyebrow} heading={hero.heading} subtitle={hero.subtitle} />

      <DealsCardGrid cards={cards} />

      {DEALS_FORM_ID && <KlaviyoForm formId={DEALS_FORM_ID} />}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<DealsPageProps> = async () => {
  try {
    const client = getClient();
    const [pageResult, ctasResult, menuClient] = await Promise.all([
      client.query({
        query: GET_CONTENT_PAGE_BY_SLUG,
        variables: { slug: '/mellow-fellow-coupons-and-sales' },
      }),
      client.query({ query: GET_DEALS_CARD_GRID }).catch(() => ({ data: null })),
      prefetchMenus(),
    ]);

    const group = ctasResult.data?.pageBy?.dealsPageCtas;
    const rows = group?.dealCtas || [];
    const cards: DealCard[] = rows
      .filter((row: any) => row?.visible)
      .filter((row: any) => row?.dealLink?.url)
      .map((row: any) => {
        const imageNode = row.image?.node;
        const rawLink = row.dealLink?.url;
        const parsed = rawLink ? new URL(rawLink, 'https://x') : null;
        const href = parsed ? parsed.pathname + parsed.search : null;
        return {
          href,
          label: row.label,
          heading: row.heading ?? null,
          body: row.body ?? null,
          image: imageNode?.sourceUrl
            ? { src: imageNode.sourceUrl, alt: imageNode.altText ?? '' }
            : null,
        };
      });

    const hero: DealsHeroProps = {
      eyebrow: group?.heroEyebrow ?? null,
      heading: group?.heroHeading ?? null,
      subtitle: group?.heroSubtitle ?? null,
    };

    const props = { page: pageResult.data?.page ?? null, cards, hero } as any;
    mergeMenuState(props, menuClient);

    return { props, revalidate: 60 };
  } catch (error) {
    console.error('Error fetching mellow-fellow-coupons-and-sales page:', error);
    return {
      props: { page: null, cards: [], hero: { eyebrow: null, heading: null, subtitle: null } },
      revalidate: 60,
    };
  }
};
