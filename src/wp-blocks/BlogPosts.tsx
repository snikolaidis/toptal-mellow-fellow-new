import { gql, useQuery } from '@apollo/client';
import Link from 'next/link';
import Image from 'next/image';
import { getClient, getBrowserClient } from '@/lib/apollo-client';
import { GET_LATEST_POSTS } from '@/graphql/queries/posts';

interface PostNode {
  id: string;
  title?: string | null;
  slug?: string | null;
  date?: string | null;
  featuredImage?: { node?: { sourceUrl?: string | null; altText?: string | null } | null } | null;
}

interface BlogPostsProps {
  blogPosts?: {
    title?: string | null;
    postCount?: number | null;
    buttonText?: string | null;
    buttonLink?: { url?: string | null; title?: string | null; target?: string | null } | null;
  } | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
};

export default function BlogPosts(props: BlogPostsProps) {
  const data = props.blogPosts;
  const title = data?.title || 'From the blog';
  const count = Math.max(2, Math.floor(data?.postCount || 5));
  const buttonText = data?.buttonText || '';
  const buttonUrl = data?.buttonLink?.url || '/blogs';

  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data: postsData } = useQuery(GET_LATEST_POSTS, {
    client,
    variables: { first: count },
  });

  const posts: PostNode[] = postsData?.posts?.nodes ?? [];

  if (posts.length === 0) {
    return null;
  }

  const [featured, ...rest] = posts;

  return (
    <section className="blog-posts">
      <div className="container">
        <div className="blog-posts__header">
          <h3 className="blog-posts__title">{title}</h3>
          <Link href="/blogs" className="blog-posts__view-all">
            View all
          </Link>
        </div>

        <div className="blog-posts__layout">
          <Link href={`/blogs/${featured.slug}`} className="blog-posts__featured">
            <div className="blog-posts__featured-image-wrap">
              <Image
                src={featured.featuredImage?.node?.sourceUrl || '/placeholder-product.png'}
                alt={featured.featuredImage?.node?.altText || featured.title || ''}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                className="blog-posts__featured-image"
              />
            </div>
            <h4 className="blog-posts__featured-title">{featured.title}</h4>
            <span className="blog-posts__date">{formatDate(featured.date)}</span>
          </Link>

          {rest.length > 0 && (
            <div className="blog-posts__latest">
              <span className="blog-posts__latest-label">Latest posts</span>

              <ul className="blog-posts__list">
                {rest.map((post) => (
                  <li key={post.id}>
                    <Link href={`/blogs/${post.slug}`} className="blog-posts__row">
                      <div className="blog-posts__thumb-wrap">
                        <Image
                          src={post.featuredImage?.node?.sourceUrl || '/placeholder-product.png'}
                          alt={post.featuredImage?.node?.altText || post.title || ''}
                          fill
                          sizes="120px"
                          className="blog-posts__thumb"
                        />
                      </div>
                      <div className="blog-posts__row-text">
                        <span className="blog-posts__row-title">{post.title}</span>
                        <span className="blog-posts__date">{formatDate(post.date)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {buttonText && (
          <div className="blog-posts__actions">
            <Link href={buttonUrl} className="blog-posts__button">
              {buttonText}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

BlogPosts.displayName = 'AcfBlogPosts';

BlogPosts.fragments = {
  key: `AcfBlogPostsFragment`,
  entry: gql`
    fragment AcfBlogPostsFragment on AcfBlogPosts {
      blogPosts {
        title
        postCount
        buttonText
        buttonLink {
          url
          title
          target
        }
      }
    }
  `,
};
