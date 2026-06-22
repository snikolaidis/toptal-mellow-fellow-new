import Image from 'next/image';
import Link from 'next/link';
import { BlogPost, BlogTag, LatestPostCard } from '@/types/blog';
import TableOfContents from '@/components/TableOfContents';
import styles from '@/styles/pages/blogs.module.css';

interface BlogPostProps {
  post: BlogPost;
  latestPosts: LatestPostCard[];
  allTags: BlogTag[];
}

interface Heading {
  id: string;
  text: string;
}

function decodeEntities(str: string) {
  return str
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function removeImageLinks(html: string) {
  return html.replace(/<a[^>]*>\s*(<img[^>]*?\/?>\s*)<\/a>/gi, '$1');
}

function parseContent(html: string): { before: string; after: string; headings: Heading[] } {
  const cleaned = removeImageLinks(html);
  const firstH2 = cleaned.search(/<h2[\s>]/i);
  if (firstH2 === -1) return { before: cleaned, after: '', headings: [] };

  const before = cleaned.slice(0, firstH2);
  const headings: Heading[] = [];

  const after = cleaned.slice(firstH2).replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs, content) => {
    if (/id=/.test(attrs)) return match;
    const text = decodeEntities(content.replace(/<[^>]*>/g, '').trim());
    const id = slugify(text);
    headings.push({ id, text });
    return `<h2${attrs} id="${id}">${content}</h2>`;
  });

  return { before, after, headings };
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();
}

export default function BlogPostTemplate({ post, latestPosts, allTags }: BlogPostProps) {
  const tags = post.tags?.nodes || [];
  const featuredImage = post.featuredImage?.node;
  const otherLatest = latestPosts.filter((p) => p.slug !== post.slug).slice(0, 3);

  const { before, after, headings } = parseContent(post.content || '');

  return (
    <div className={styles.postPage}>
      {/* ── Header ── */}
      <header className={styles.postHeader}>
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <Link href="/blogs">Mellow Blog - Learn About Cannabis and Mellow Fellow</Link>
          <span className={styles.breadcrumbSep}>/</span>
        </nav>

        <h1 className={styles.postTitle}>{post.title}</h1>

        <div className={styles.postDates}>
          <span>Published on {formatDate(post.date)}</span>
          {post.modified && post.modified !== post.date && (
            <>
              <span className={styles.datesDot}>·</span>
              <span>Reviewed &amp; updated on {formatDate(post.modified)}</span>
            </>
          )}
        </div>

        {tags.length > 0 && (
          <div className={styles.postCategories}>
            {tags.map((tag) => (
              <Link key={tag.id} href={`/blogs?tag=${tag.slug}`} className={styles.categoryPill}>
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* ── Two-column body ── */}
      <div className={styles.postLayout}>
        {/* Left: image + content */}
        <main className={styles.postMain}>
          {featuredImage && (
            <div className={styles.postFeaturedImage}>
              <Image
                src={featuredImage.sourceUrl}
                alt={featuredImage.altText || post.title}
                fill
                sizes="(max-width: 768px) 100vw, 780px"
                className={styles.featuredImageImg}
                priority
              />
            </div>
          )}

          {/* Content before first h2 */}
          {before && (
            <div className={styles.postContent} dangerouslySetInnerHTML={{ __html: before }} />
          )}

          {/* Table of contents injected before first h2 */}
          <TableOfContents headings={headings} />

          {/* Remaining content starting from first h2 */}
          {after && (
            <div className={styles.postContent} dangerouslySetInnerHTML={{ __html: after }} />
          )}

          {/* Social follow — under content */}
          <div className={styles.postSocialFollow}>
            <p className={styles.postSocialTitle}>Follow us for more articles like this</p>
            <div className={styles.postSocialIcons}>
              <a href="https://www.instagram.com/mellowfellowfam" title="Instagram" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
              <a href="https://www.facebook.com/MellowFellowFam" title="Facebook" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.791-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.953h-1.514c-1.491 0-1.956.93-1.956 1.885v2.283h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              </a>
              <a href="https://www.linkedin.com/company/mellowfellowfun" title="LinkedIn" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="https://www.youtube.com/channel/UCfD7HDVHY91GPjXHXwHk24w" title="YouTube" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
              </a>
              <a href="https://twitter.com/MellowFellowFam" title="X" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://www.tiktok.com/@mellowfellowinfo?lang=en" title="TikTok" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
              </a>
            </div>
          </div>

          <div className={styles.postFooter}>
            <Link href="/blogs" className={styles.backLink}>← Back to Blog</Link>
          </div>
        </main>

        {/* Right: sidebar */}
        <aside className={styles.postSidebar}>
          {otherLatest.length > 0 && (
            <section className={styles.sidebarSection}>
              <div className={styles.sidebarSectionHeader}>
                <h3 className={styles.sidebarTitle}>Latest Posts</h3>
                <Link href="/blogs" className={styles.viewAllLink}>View all</Link>
              </div>
              <div className={styles.latestPosts}>
                {otherLatest.map((p) => (
                  <Link key={p.id} href={`/blogs/${p.slug}`} className={styles.latestPostCard}>
                    {p.featuredImage?.node && (
                      <div className={styles.latestPostImage}>
                        <Image
                          src={p.featuredImage.node.sourceUrl}
                          alt={p.featuredImage.node.altText || p.title}
                          fill
                          sizes="120px"
                          className={styles.latestPostImg}
                        />
                      </div>
                    )}
                    <div className={styles.latestPostBody}>
                      {p.tags?.nodes?.length > 0 && (
                        <div className={styles.latestPostTags}>
                          {p.tags.nodes.slice(0, 2).map((tag) => (
                            <span key={tag.id} className={styles.latestPostTag}>{tag.name}</span>
                          ))}
                        </div>
                      )}
                      <p className={styles.latestPostTitle}>{p.title}</p>
                      <time className={styles.latestPostDate}>{formatDate(p.date)}</time>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {allTags.length > 0 && (
            <section className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Explore more</h3>
              <div className={styles.tagCloud}>
                {allTags.map((tag) => (
                  <Link key={tag.id} href={`/blogs?tag=${tag.slug}`} className={styles.tagPill}>
                    {tag.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className={styles.socialSection}>
            <p className={styles.socialSectionTitle}>Share on Social</p>
            <div className={styles.socialIcons}>
              <a href="https://www.facebook.com/MellowFellowFam" title="Facebook" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.791-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.953h-1.514c-1.491 0-1.956.93-1.956 1.885v2.283h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              </a>
              <a href="https://twitter.com/MellowFellowFam" title="X" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://www.linkedin.com/company/mellowfellowfun" title="LinkedIn" target="_blank" rel="noopener noreferrer" className={styles.socialIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
