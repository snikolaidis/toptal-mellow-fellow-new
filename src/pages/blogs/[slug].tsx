import { GetStaticProps, GetStaticPaths } from 'next';
import { getClient } from '@/lib/apollo-client';
import {
  GET_POST_BY_SLUG,
  GET_ALL_POST_SLUGS,
  GET_LATEST_POSTS,
  fetchAllTags,
} from '@/graphql/queries/posts';
import { GET_PRODUCTS_BY_IDS } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import BlogPostTemplate from '@/templates/blogs/BlogPost';
import { BlogPost, BlogTag, LatestPostCard } from '@/types/blog';
import { Product } from '@/types/woocommerce';

interface BlogPostPageProps {
  post: BlogPost;
  latestPosts: LatestPostCard[];
  allTags: BlogTag[];
  relatedProducts: Product[];
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

function buildFaqSchema(post: BlogPost): string | undefined {
  const faqs = post.blogPostsFields?.faqs?.nodes;
  if (!faqs?.length) return undefined;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.title,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.content?.replace(/<[^>]*>/g, '').trim() || '',
      },
    })),
  });
}

function buildArticleSchema(post: BlogPost) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt?.replace(/<[^>]*>/g, '') || '',
    image: post.featuredImage?.node?.sourceUrl,
    datePublished: post.date,
    dateModified: post.modified || post.date,
    author: {
      '@type': 'Person',
      name: post.author?.node?.name || 'Mellow Fellow',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Mellow Fellow',
      url: SITE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/blogs/${post.slug}`,
    },
  });
}

export default function BlogPostPage({ post, latestPosts, allTags, relatedProducts }: BlogPostPageProps) {
  const schema = post.seo?.schema?.raw || buildArticleSchema(post);
  const faqSchema = buildFaqSchema(post);

  return (
    <Layout
      title={post.title}
      seo={{
        title: post.seo?.title,
        metaDesc: post.seo?.metaDesc,
        schema,
        faqSchema,
        opengraphTitle: post.seo?.opengraphTitle,
        opengraphDescription: post.seo?.opengraphDescription,
        opengraphImage: post.seo?.opengraphImage?.sourceUrl,
        ogType: 'article',
        canonical: `${SITE_URL}/blogs/${post.slug}`,
        publishedTime: post.date,
        modifiedTime: post.modified || post.date,
      }}
    >
      <BlogPostTemplate post={post} latestPosts={latestPosts} allTags={allTags} relatedProducts={relatedProducts} />
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({ query: GET_ALL_POST_SLUGS });

    const paths = data?.posts?.nodes?.map((post: { slug: string }) => ({
      params: { slug: post.slug },
    })) || [];

    return { paths, fallback: 'blocking' };
  } catch (error) {
    console.error('Error fetching post slugs:', error);
    return { paths: [], fallback: 'blocking' };
  }
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  try {
    const client = getClient();

    const [postResult, latestResult, allTags] = await Promise.all([
      client.query({ query: GET_POST_BY_SLUG, variables: { slug: params?.slug } }),
      client.query({ query: GET_LATEST_POSTS, variables: { first: 4 } }),
      fetchAllTags(client),
    ]);

    if (!postResult.data?.post) {
      return { notFound: true };
    }

    const post = postResult.data.post;
    const relatedIds = (post.smartRelatedProducts || []).map(
      (p: { databaseId: number }) => p.databaseId
    );

    let relatedProducts: Product[] = [];
    if (relatedIds.length) {
      try {
        const relatedResult = await client.query({
          query: GET_PRODUCTS_BY_IDS,
          variables: { ids: relatedIds },
        });
        const byId = new Map<number, Product>(
          (relatedResult.data?.products?.nodes || []).map((p: Product) => [p.databaseId, p])
        );
        relatedProducts = relatedIds
          .map((id: number) => byId.get(id))
          .filter((p: Product | undefined): p is Product => !!p);
      } catch (error) {
        console.error('Error fetching related products:', error);
      }
    }

    return {
      props: {
        post,
        latestPosts: latestResult.data?.posts?.nodes || [],
        allTags,
        relatedProducts,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching post:', error);
    return { notFound: true };
  }
};
