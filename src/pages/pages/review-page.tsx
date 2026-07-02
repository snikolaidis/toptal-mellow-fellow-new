import { GetStaticProps } from 'next';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';
import styles from '@/styles/pages/review-page.module.css';

interface ReviewPageProps {
  page: ContentPageData | null;
}

export default function ReviewPage({ page }: ReviewPageProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Layout title={page?.title ?? 'Reviews'} seo={page?.seo}>
      {page && <ContentPage page={page} />}
      {mounted && (
        <div className={styles.reviewsWrap}>
          <div id="klaviyo-reviews-all" data-id="all" />
        </div>
      )}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<ReviewPageProps> = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_CONTENT_PAGE_BY_SLUG,
      variables: { slug: '/review-page' },
    });
    return { props: { page: data?.page ?? null }, revalidate: 60 };
  } catch (error) {
    console.error('Error fetching review-page page:', error);
    return { props: { page: null }, revalidate: 60 };
  }
};
