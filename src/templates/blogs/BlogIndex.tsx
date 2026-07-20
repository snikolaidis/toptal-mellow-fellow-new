import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BlogPostCard, BlogTag } from '@/types/blog';
import styles from '@/styles/pages/blogs.module.css';

interface BlogIndexProps {
  posts: BlogPostCard[];
  allTags: BlogTag[];
  title?: string;
  description?: string;
  activeTag?: string;
  basePath?: string;
}

const PAGE_SIZE = 30;

// Always shows first/last page plus the current page's neighborhood,
// collapsing the rest into '...' — e.g. [1,2,3,4,'...',61] or
// [1,'...',29,30,31,'...',61].
function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const range: (number | '...')[] = [1];

  if (current <= 4) {
    for (let i = 2; i <= 4; i++) range.push(i);
    range.push('...');
  } else if (current >= total - 3) {
    range.push('...');
    for (let i = total - 3; i <= total - 1; i++) range.push(i);
  } else {
    range.push('...', current - 1, current, current + 1, '...');
  }

  range.push(total);
  return range;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, '');
}

function PostCard({ post }: { post: BlogPostCard }) {
  return (
    <Link href={`/blogs/${post.slug}`} className={styles.postCard}>
      {post.featuredImage?.node && (
        <div className={styles.postCardImage}>
          <Image
            src={post.featuredImage.node.sourceUrl}
            alt={post.featuredImage.node.altText || post.title}
            fill
            sizes="(max-width: 768px) 100vw, 40vw"
            className={styles.featuredImageImg}
          />
        </div>
      )}
      <div className={styles.postCardBody}>
        <h3 className={styles.postCardTitle}>{post.title}</h3>
        <time className={styles.postCardDate} dateTime={post.date}>{formatDate(post.date)}</time>
        {post.excerpt && (
          <p className={styles.postCardExcerpt}>
            {stripHtml(post.excerpt).slice(0, 120)}…
          </p>
        )}
      </div>
    </Link>
  );
}

export default function BlogIndex({ posts, allTags, title, description, activeTag: activeTagProp, basePath = '/blogs' }: BlogIndexProps) {
  const router = useRouter();
  const activeTag = activeTagProp ?? ((router.query.tag as string) || null);
  const page = Math.max(1, parseInt((router.query.page as string) || '1', 10) || 1);

  const filteredPosts = activeTag
    ? posts.filter((p) => p.tags?.nodes?.some((t) => t.slug === activeTag))
    : posts;

  function handleTagClick(slug: string) {
    router.push(activeTag === slug ? '/blogs' : `/blogs/tag/${slug}`);
  }

  function goToPage(p: number) {
    router.push(
      {
        pathname: basePath,
        query: {
          ...(activeTagProp === undefined && activeTag ? { tag: activeTag } : {}),
          ...(p > 1 ? { page: p } : {}),
        },
      },
      undefined,
      { shallow: true }
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!posts.length) {
    return <div className={styles.emptyState}><p>No posts found.</p></div>;
  }

  const featured = page === 1 ? filteredPosts[0] ?? null : null;
  const restPosts = filteredPosts.slice(1);
  const totalPages = Math.max(1, Math.ceil(restPosts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const gridPosts = restPosts.slice(pageStart, pageStart + PAGE_SIZE);
  const paginationRange = getPaginationRange(currentPage, totalPages);

  return (
    <div className={styles.indexPage}>
      {/* Header */}
      <div className={styles.indexHeader}>
        <h1 className={styles.indexTitle}>{title || 'Blog'}</h1>
        {description && (
          <p
            className={styles.indexSubtitle}
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}
      </div>

      {/* Featured post — always the first matching post */}
      {featured && (
        <Link href={`/blogs/${featured.slug}`} className={styles.featuredPost}>
          {featured.featuredImage?.node && (
            <div className={styles.featuredPostImage}>
              <Image
                src={featured.featuredImage.node.sourceUrl}
                alt={featured.featuredImage.node.altText || featured.title}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                className={styles.featuredImageImg}
                priority
              />
            </div>
          )}
          <div className={styles.featuredPostBody}>
            <h2 className={styles.featuredPostTitle}>{featured.title}</h2>
            {featured.excerpt && (
              <p className={styles.featuredPostExcerpt}>
                {stripHtml(featured.excerpt).slice(0, 160)}…
              </p>
            )}
            <div className={styles.postMeta}>
              <span className={styles.postAuthor}>By {featured.author?.node?.name}</span>
              <span className={styles.postMetaDivider}>·</span>
              <time dateTime={featured.date}>{formatDate(featured.date)}</time>
            </div>
          </div>
        </Link>
      )}

      {/* Two-column layout — always rendered to prevent layout shift */}
      <div className={styles.indexLayout}>
        <div className={styles.postsGrid}>
          {filteredPosts.length === 0 ? (
            <p className={styles.noResults}>No posts found for this tag.</p>
          ) : (
            gridPosts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>

        {allTags.length > 0 && (
          <aside className={styles.indexSidebar}>
            <section className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Explore more</h3>
              <div className={styles.tagCloud}>
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleTagClick(tag.slug)}
                    className={`${styles.tagPill} ${activeTag === tag.slug ? styles.tagPillActive : ''}`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        )}
      </div>

      {totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Blog pagination">
          <button
            type="button"
            className={styles.pageArrow}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
              <path d="M9 1L2 8l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {paginationRange.map((entry, i) =>
            entry === '...' ? (
              <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
            ) : (
              <button
                key={entry}
                type="button"
                className={`${styles.pageNumber} ${entry === currentPage ? styles.pageNumberActive : ''}`}
                onClick={() => goToPage(entry)}
                aria-current={entry === currentPage ? 'page' : undefined}
              >
                {entry}
              </button>
            )
          )}

          <button
            type="button"
            className={styles.pageArrow}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
              <path d="M1 1l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </nav>
      )}
    </div>
  );
}
