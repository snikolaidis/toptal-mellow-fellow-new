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
              {[
                { href: 'https://www.instagram.com/mellowfellowfam', src: 'https://cdn.tools.unlayer.com/social/icons/circle-black/instagram.png', label: 'Instagram' },
                { href: 'https://www.facebook.com/MellowFellowFam', src: 'https://cdn.tools.unlayer.com/social/icons/circle-black/facebook.png', label: 'Facebook' },
                { href: 'https://www.linkedin.com/company/mellowfellowfun', src: 'https://cdn.tools.unlayer.com/social/icons/circle-black/linkedin.png', label: 'LinkedIn' },
                { href: 'https://www.youtube.com/channel/UCfD7HDVHY91GPjXHXwHk24w', src: 'https://cdn.tools.unlayer.com/social/icons/circle-black/youtube.png', label: 'YouTube' },
                { href: 'https://twitter.com/MellowFellowFam', src: 'https://cdn.tools.unlayer.com/social/icons/circle-black/x.png', label: 'X' },
                { href: 'https://www.tiktok.com/@mellowfellowinfo?lang=en', src: 'https://cdn.tools.unlayer.com/social/icons/circle-black/tiktok.png', label: 'TikTok' },
              ].map(({ href, src, label }) => (
                <a key={label} href={href} title={label} target="_blank" rel="noopener noreferrer">
                  <img src={src} alt={label} width={32} height={32} />
                </a>
              ))}
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
