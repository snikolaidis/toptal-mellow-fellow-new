import { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import ContactForm from '@/components/ContactForm';
import PressGrid from '@/components/press/PressGrid';
import type { NewsArticle } from '@/components/press/PressGrid';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import { GET_NEWS_ARTICLES } from '@/graphql/queries/news';
import type { ContentPageData } from '@/types/mellow-fellow';

interface PressPageProps {
  page: ContentPageData | null;
  articles: NewsArticle[];
}

export default function MellowPressPage({ page, articles }: PressPageProps) {
  return (
    <Layout title={page?.title ?? 'Press'} seo={page?.seo}>
      {page && <ContentPage page={page} />}
      <PressGrid articles={articles} />
      <ContactForm />
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<PressPageProps> = async () => {
  try {
    const client = getClient();
    const [pageResult, newsResult] = await Promise.all([
      client.query({
        query: GET_CONTENT_PAGE_BY_SLUG,
        variables: { slug: '/mellow-press' },
      }),
      client.query({ query: GET_NEWS_ARTICLES }),
    ]);
    const articles = [...(newsResult.data?.newsArticles?.nodes ?? [])].sort((a, b) => {
      const ta = Date.parse(a?.newsArticleDetails?.publicationDate ?? '');
      const tb = Date.parse(b?.newsArticleDetails?.publicationDate ?? '');
      const va = Number.isNaN(ta) ? -Infinity : ta;
      const vb = Number.isNaN(tb) ? -Infinity : tb;
      return vb - va;
    });
    return {
      props: {
        page: pageResult.data?.page ?? null,
        articles,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching mellow-press page:', error);
    return { props: { page: null, articles: [] }, revalidate: 60 };
  }
};
