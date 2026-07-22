import { GetStaticPaths, GetStaticProps } from 'next';
import { gql } from '@apollo/client';
import { getClient } from '@/lib/apollo-client';
import { fetchAllTags } from '@/graphql/queries/posts';
import Layout from '@/components/Layout';
import BlogIndex from '@/templates/blogs/BlogIndex';
import { BlogPostCard, BlogTag } from '@/types/blog';

const GET_TAG_META = gql`
  query GetTagMeta($id: ID!) {
    tag(id: $id, idType: SLUG) {
      id
      name
      slug
    }
  }
`;

const GET_TAG_POSTS_PAGE = gql`
  query GetTagPostsPage($slug: String!, $after: String) {
    posts(first: 100, after: $after, where: { tag: $slug, orderby: { field: DATE, order: DESC } }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        databaseId
        title
        slug
        excerpt
        date
        featuredImage {
          node {
            sourceUrl
            altText
          }
        }
        categories {
          nodes {
            id
            name
            slug
          }
        }
        tags {
          nodes {
            id
            name
            slug
          }
        }
        author {
          node {
            name
          }
        }
      }
    }
  }
`;

async function fetchTagPosts(
  client: ReturnType<typeof getClient>,
  slug: string
): Promise<BlogPostCard[]> {
  const posts: BlogPostCard[] = [];
  let after: string | null = null;

  for (;;) {
    const result: any = await client.query({
      query: GET_TAG_POSTS_PAGE,
      variables: { slug, after },
    });
    const page = result.data?.posts;
    posts.push(...(page?.nodes || []));
    if (!page?.pageInfo?.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }

  return posts;
}

interface BlogTagPageProps {
  tag: BlogTag;
  posts: BlogPostCard[];
  allTags: BlogTag[];
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

export default function BlogTagPage({ tag, posts, allTags }: BlogTagPageProps) {
  const description = `Read the latest Mellow Fellow posts tagged ${tag.name}.`;

  return (
    <Layout
      title={tag.name}
      description={description}
      seo={{
        title: `${tag.name} | Mellow Fellow`,
        metaDesc: description,
        opengraphTitle: `${tag.name} | Mellow Fellow`,
        opengraphDescription: description,
        canonical: `${SITE_URL}/blogs/tag/${tag.slug}`,
      }}
    >
      <BlogIndex
        posts={posts}
        allTags={allTags}
        title={tag.name}
        activeTag={tag.slug}
        basePath={`/blogs/tag/${tag.slug}`}
      />
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = params?.slug as string;

  try {
    const client = getClient();

    const [tagResult, posts, allTags] = await Promise.all([
      client.query({ query: GET_TAG_META, variables: { id: slug } }),
      fetchTagPosts(client, slug),
      fetchAllTags(client),
    ]);

    if (!tagResult.data?.tag || !posts.length) {
      return { notFound: true };
    }

    return {
      props: {
        tag: tagResult.data.tag,
        posts,
        allTags,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching tag posts:', error);
    return { notFound: true };
  }
};
