import { GetStaticProps } from 'next';
import Link from 'next/link';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import KlaviyoForm from '@/components/KlaviyoForm';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';

const DEALS_FORM_ID = process.env.NEXT_PUBLIC_KLAVIYO_DEALS_FORM_ID;

const OFFERS = [
  { href: '/collection/mellow-fellow-wellness-all', label: 'Shop Wellness' },
  { href: '/collection/live-resin-edibles', label: 'Shop Live Resin Edibles' },
];

interface DealsPageProps {
  page: ContentPageData | null;
}

export default function DealsPage({ page }: DealsPageProps) {
  return (
    <Layout title={page?.title ?? 'Deals'} seo={page?.seo}>
      {page && <ContentPage page={page} />}

      <div className="buttons">
        {OFFERS.map((offer) => (
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
    const { data } = await client.query({
      query: GET_CONTENT_PAGE_BY_SLUG,
      variables: { slug: '/mellow-fellow-coupons-and-sales' },
    });
    return { props: { page: data?.page ?? null }, revalidate: 60 };
  } catch (error) {
    console.error('Error fetching mellow-fellow-coupons-and-sales page:', error);
    return { props: { page: null }, revalidate: 60 };
  }
};
