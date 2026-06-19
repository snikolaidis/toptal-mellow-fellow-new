import fs from 'fs';
import path from 'path';
import { GetStaticProps, GetStaticPaths } from 'next';
import { getClient } from '@/lib/apollo-client';
import Layout from '@/components/Layout';
import ContentPage from '@/components/ContentPage';
import type { ContentPageData } from '@/types/mellow-fellow';
import {
  GET_CONTENT_PAGE_BY_SLUG,
  GET_ALL_CONTENT_PAGE_SLUGS,
} from '@/graphql/queries/pages';

interface PageProps {
  page: ContentPageData;
}

export default function WordPressPage({ page }: PageProps) {
  if (!page) return null;

  return (
    <Layout title={page.title} seo={page.seo}>
      <ContentPage page={page} />
    </Layout>
  );
}

function dedicatedPageSlugs(): string[] {
  try {
    const pagesDir = path.join(process.cwd(), 'src', 'pages', 'pages');
    return fs
      .readdirSync(pagesDir)
      .filter((file) => /\.(tsx|ts|jsx|js)$/.test(file))
      .map((file) => file.replace(/\.(tsx|ts|jsx|js)$/, ''))
      .filter((name) => name !== '[slug]' && name !== 'index');
  } catch {
    return ['bonus-points-products', 'rewards', 'affiliate', 'mellow-day-2026'];
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  const excludeSlugs = dedicatedPageSlugs();

  try {
    const client = getClient();
    const { data } = await client.query({ query: GET_ALL_CONTENT_PAGE_SLUGS });

    const paths = (data?.pages?.nodes ?? [])
      .filter(({ slug }: { slug: string }) => !excludeSlugs.includes(slug))
      .map(({ slug }: { slug: string }) => ({ params: { slug } }));

    return { paths, fallback: 'blocking' };
  } catch (error) {
    // WP unreachable at build time: defer every page to on-demand ISR rather
    // than failing the build.
    console.error('Error fetching page slugs:', error);
    return { paths: [], fallback: 'blocking' };
  }
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_CONTENT_PAGE_BY_SLUG,
      variables: { slug: `/${params?.slug}` },
    });

    if (!data?.page) {
      return { notFound: true, revalidate: 60 };
    }

    return {
      props: { page: data.page },
      revalidate: 60,
    };
  } catch (error) {
    // Transient WP error (429/504): regenerate on-demand instead of crashing
    // the build for this path.
    console.error(`Error fetching page "${params?.slug}":`, error);
    return { notFound: true, revalidate: 60 };
  }
};
