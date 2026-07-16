import { GetStaticProps } from 'next';
import { getClient } from '@/lib/apollo-client';
import { GET_ALL_POSTS, GET_CATEGORY_BY_SLUG, fetchAllTags } from '@/graphql/queries/posts';
import Layout from '@/components/Layout';
import BlogIndex from '@/templates/blogs/BlogIndex';
import { BlogPostCard, BlogTag } from '@/types/blog';

// Slug of the WordPress category that represents the blog section
const BLOG_CATEGORY_SLUG = 'blog';

interface BlogsPageProps {
  posts: BlogPostCard[];
  allTags: BlogTag[];
  categoryTitle: string;
  categoryDescription: string;
}

export default function BlogsPage({ posts, allTags, categoryTitle, categoryDescription }: BlogsPageProps) {
  return (
    <Layout
      title={categoryTitle || 'Blog'}
      description={categoryDescription || 'Stories, tips, and updates from Mellow Fellow'}
      seo={{
        title: `${categoryTitle || 'Blog'} | Mellow Fellow`,
        metaDesc: categoryDescription || 'Stories, tips, and updates from Mellow Fellow',
        opengraphTitle: `${categoryTitle || 'Blog'} | Mellow Fellow`,
        opengraphDescription: categoryDescription || 'Stories, tips, and updates from Mellow Fellow',
      }}
    >
      <BlogIndex
        posts={posts}
        allTags={allTags}
        title={categoryTitle}
        description={categoryDescription}
      />
    </Layout>
  );
}

// WPGraphQL caps a single connection query (this install allows up to 500
// per request) — loop with the cursor until every post has been fetched, so
// pagination on the client can page through the whole set, not just the
// first batch.
interface PostsPage {
  posts?: {
    nodes?: BlogPostCard[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
}

async function fetchAllPosts(client: ReturnType<typeof getClient>): Promise<BlogPostCard[]> {
  const all: BlogPostCard[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result: { data?: PostsPage } = await client.query<PostsPage>({
      query: GET_ALL_POSTS,
      variables: { first: 100, after },
    });
    const posts = result.data?.posts;
    all.push(...(posts?.nodes || []));
    hasNextPage = posts?.pageInfo?.hasNextPage || false;
    after = posts?.pageInfo?.endCursor || null;
  }

  return all;
}

export const getStaticProps: GetStaticProps = async () => {
  try {
    const client = getClient();

    const [posts, allTags, categoryResult] = await Promise.all([
      fetchAllPosts(client),
      fetchAllTags(client),
      client.query({ query: GET_CATEGORY_BY_SLUG, variables: { slug: BLOG_CATEGORY_SLUG } }),
    ]);

    return {
      props: {
        posts,
        allTags,
        categoryTitle: categoryResult.data?.category?.name || '',
        categoryDescription: categoryResult.data?.category?.description || '',
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching blog index:', error);
    return {
      props: { posts: [], allTags: [], categoryTitle: '', categoryDescription: '' },
      revalidate: 60,
    };
  }
};
