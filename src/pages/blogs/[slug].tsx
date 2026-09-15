import { GetStaticProps, GetStaticPaths } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { getClient } from '@/lib/apollo-client';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import {
  GET_POST_BY_SLUG,
  GET_ALL_POST_SLUGS,
  GET_LATEST_POSTS_LITE,
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

// Set before Next forks the workers that prerender pages, and never set in the
// server runtime. Next branches on the same variable itself.
const isBuildPhase = () => process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

const BUILD_FALLTHROUGH_REVALIDATE = 10;

// Without an expiry a notFound stands until the next deploy, and a missing post
// can be published later.
const NOT_FOUND_REVALIDATE = 600;

export const getStaticPaths: GetStaticPaths = async () => {
  // Don't pre-render blog posts at build time — hundreds of posts overwhelm
  // WordPress with concurrent requests, causing 120s build timeouts.
  // Posts generate on first visit via fallback: 'blocking' and cache with ISR.
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  try {
    const client = getClient();

    const [postResult, latestResult, allTags, menuClient] = await Promise.all([
      client.query({ query: GET_POST_BY_SLUG, variables: { slug: params?.slug } }),
      // Lite, not GET_LATEST_POSTS: that one also selects `content`, which the
      // sidebar never renders and which cost 169KB of every blog post page's HTML.
      client.query({ query: GET_LATEST_POSTS_LITE, variables: { first: 4 } }),
      fetchAllTags(client),
      prefetchMenus(),
    ]);

    // Genuinely missing is: resolved, no errors, `post` null. errorPolicy 'all' makes
    // a rejected document look identical to `!data?.post`. `errors` not `error`: never set.
    if (postResult.errors?.length) {
      throw new Error(
        `GET_POST_BY_SLUG returned errors for "${slug}": ${postResult.errors
          .map((e) => e.message)
          .join('; ')}`
      );
    }

    if (!postResult.data) {
      throw new Error(`GET_POST_BY_SLUG returned no data for "${slug}"`);
    }

    const post = postResult.data.post;

    if (post === null) {
      return { notFound: true, revalidate: NOT_FOUND_REVALIDATE };
    }

    if (!post) {
      throw new Error(`GET_POST_BY_SLUG returned neither a post nor an error for "${slug}"`);
    }

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

    const props: Record<string, any> = {
      post,
      latestPosts: latestResult.data?.posts?.nodes || [],
      allTags,
      relatedProducts,
    };
    mergeMenuState(props, menuClient);

    return { props, revalidate: 60 };
  } catch (error) {
    console.error(`[Blog] failed to build "${slug}":`, error);

    // A throw at build time would fail the whole deploy, which is worse than one
    // article arriving late, so the build path leaves it to `fallback: 'blocking'`.
    if (isBuildPhase()) {
      return { notFound: true, revalidate: BUILD_FALLTHROUGH_REVALIDATE };
    }

    // Deliberately not `notFound`: ISR then keeps serving the last good copy
    // instead of pinning "this article does not exist" on top of a real one.
    throw error;
  }
};
