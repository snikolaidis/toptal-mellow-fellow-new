import { GetStaticProps, GetStaticPaths } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';

const GET_PAGE = gql`
  query GetPage($slug: ID!) {
    page(id: $slug, idType: URI) {
      title
      slug
      editorBlocks(flat: true) {
        __typename
        renderedHtml
      }
      seo {
        title
        metaDesc
      }
    }
  }
`;

const GET_ALL_PAGE_SLUGS = gql`
  query GetAllPageSlugs {
    pages(first: 100) {
      nodes { slug }
    }
  }
`;

interface PageProps {
  page: {
    title: string;
    editorBlocks: any[];
    seo?: { title?: string; metaDesc?: string };
  };
}

export default function WordPressPage({ page }: PageProps) {
  if (!page) return null;

  return (
    <Layout
      title={page.seo?.title ?? page.title}
      description={page.seo?.metaDesc ?? ''}
    >
      {page.editorBlocks?.length ? (
        <div className="container py-12">
          {page.editorBlocks.map((block, index) => (
            block.renderedHtml ? (
              <div
                key={index}
                dangerouslySetInnerHTML={{ __html: block.renderedHtml }}
              />
            ) : null
          ))}
        </div>
      ) : (
        <div className="container py-12">
          <h1>{page.title}</h1>
        </div>
      )}
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const client = getClient();
  const { data } = await client.query({ query: GET_ALL_PAGE_SLUGS });

  const paths = data?.pages?.nodes?.map(({ slug }: { slug: string }) => ({
    params: { slug },
  })) ?? [];

  return { paths, fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const client = getClient();
  const { data } = await client.query({
    query: GET_PAGE,
    variables: { slug: `/${params?.slug}` },
  });

  if (!data?.page) {
    return { notFound: true };
  }

  return {
    props: { page: data.page },
    revalidate: 60,
  };
};
