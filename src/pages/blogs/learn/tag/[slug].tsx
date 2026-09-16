import { GetStaticPaths, GetStaticProps } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { gql } from '@apollo/client';
import { getClient } from '@/lib/apollo-client';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
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

    // errorPolicy 'all' resolves a rejected document instead of throwing, and reading
    // that as "no posts" 404s a real tag. `errors` not `error`: the singular is never set.
    if (result.errors?.length) {
      throw new Error(
        `GET_TAG_POSTS_PAGE returned errors for "${slug}": ${result.errors
          .map((e: { message: string }) => e.message)
          .join('; ')}`
      );
    }

    const page = result.data?.posts;

    if (!page) {
      throw new Error(`GET_TAG_POSTS_PAGE returned no posts connection for "${slug}"`);
    }

    posts.push(...(page.nodes || []));
    if (!page.pageInfo?.hasNextPage) break;
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
        canonical: `${SITE_URL}/blogs/learn/tag/${tag.slug}`,
      }}
    >
      <BlogIndex
        posts={posts}
        allTags={allTags}
        title={tag.name}
        activeTag={tag.slug}
        basePath={`/blogs/learn/tag/${tag.slug}`}
      />
    </Layout>
  );
}

// Set before Next forks the workers that prerender pages, and never set in the
// server runtime. Next branches on the same variable itself.
const isBuildPhase = () => process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

const BUILD_FALLTHROUGH_REVALIDATE = 10;

// Without an expiry a notFound stands until the next deploy, and a tag can gain
// its first post later.
const NOT_FOUND_REVALIDATE = 600;

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  try {
    const client = getClient();

    const [tagResult, posts, allTags, menuClient] = await Promise.all([
      client.query({ query: GET_TAG_META, variables: { id: slug } }),
      fetchTagPosts(client, slug),
      fetchAllTags(client),
      prefetchMenus(),
    ]);

    // Checked apart from the post count: a rejected document resolves with `data`
    // undefined, and the old merged condition read that as a missing tag.
    if (tagResult.errors?.length) {
      throw new Error(
        `GET_TAG_META returned errors for "${slug}": ${tagResult.errors
          .map((e) => e.message)
          .join('; ')}`
      );
    }

    if (!tagResult.data) {
      throw new Error(`GET_TAG_META returned no data for "${slug}"`);
    }

    const tag = tagResult.data.tag;

    if (tag === null) {
      return { notFound: true, revalidate: NOT_FOUND_REVALIDATE };
    }

    if (!tag) {
      throw new Error(`GET_TAG_META returned neither a tag nor an error for "${slug}"`);
    }

    // A real tag with no posts still 404s. Nothing links to one, since the tag
    // cloud filters on count, and there is no empty state designed.
    if (!posts.length) {
      return { notFound: true, revalidate: NOT_FOUND_REVALIDATE };
    }

    const props: Record<string, any> = {
      tag,
      posts,
      allTags,
    };
    mergeMenuState(props, menuClient);

    return { props, revalidate: 60 };
  } catch (error) {
    console.error(`[BlogTag] failed to build "${slug}":`, error);

    // A throw at build time would fail the whole deploy, so the build path leaves
    // it to `fallback: 'blocking'` instead.
    if (isBuildPhase()) {
      return { notFound: true, revalidate: BUILD_FALLTHROUGH_REVALIDATE };
    }

    // Deliberately not `notFound`: ISR then keeps serving the last good copy
    // instead of pinning "this tag does not exist" on top of a real one.
    throw error;
  }
};
