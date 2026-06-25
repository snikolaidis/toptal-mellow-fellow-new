import { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import ContactForm from '@/components/ContactForm';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';

interface PressPageProps {
  page: ContentPageData | null;
}

export default function MellowPressPage({ page }: PressPageProps) {
  return (
    <Layout title={page?.title ?? 'Press'} seo={page?.seo}>
      {page && <ContentPage page={page} />}   {/* "In the News" content, when published */}
      <ContactForm />                           {/* always at the bottom */}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<PressPageProps> = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_CONTENT_PAGE_BY_SLUG,
      variables: { slug: '/mellow-press' },
    });
    return { props: { page: data?.page ?? null }, revalidate: 60 };
  } catch (error) {
    console.error('Error fetching mellow-press page:', error);
    return { props: { page: null }, revalidate: 60 };
  }
};