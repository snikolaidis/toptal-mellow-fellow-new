import { GetStaticProps } from 'next';
import { getClient } from '@/lib/apollo-client';
import { GET_ALL_POSTS, GET_ALL_TAGS, GET_CATEGORY_BY_SLUG } from '@/graphql/queries/posts';
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

export const getStaticProps: GetStaticProps = async () => {
  try {
    const client = getClient();

    const [postsResult, tagsResult, categoryResult] = await Promise.all([
      client.query({ query: GET_ALL_POSTS, variables: { first: 100 } }),
      client.query({ query: GET_ALL_TAGS }),
      client.query({ query: GET_CATEGORY_BY_SLUG, variables: { slug: BLOG_CATEGORY_SLUG } }),
    ]);

    return {
      props: {
        posts: postsResult.data?.posts?.nodes || [],
        allTags: tagsResult.data?.tags?.nodes || [],
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
