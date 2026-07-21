import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import {
  GET_COLLECTION_META,
  GET_ALL_COLLECTION_SLUGS,
} from '@/graphql/queries/collections';
import { GET_COLLECTION_PRODUCTS } from '@/graphql/queries/products';
import { GET_ALL_TAGS, GET_LATEST_POSTS_LITE } from '@/graphql/queries/posts';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ReviewsCarousel from '@/wp-blocks/ReviewsCarousel';
import BlogPostsCarousel from '@/components/BlogPostsCarousel';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Collection, Product } from '@/types/woocommerce';
import { BlogPostCard, BlogTag } from '@/types/blog';
import {
  SORT_OPTIONS,
  FACET_PRODUCT_CONNECTION,
  ActiveFilters,
  deriveFilterGroups,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/collection.module.css';

const RecentlyViewed = dynamic(() => import('@/components/pdp/RecentlyViewed'), { ssr: false });

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'your', 'our', 'a', 'an', 'of', 'to', 'in', 'on']);

function toWordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      // naive singularization (e.g. "blunts" -> "blunt") so a pluralized
      // collection name still matches a singular tag, and vice versa
      .map((w) => w.replace(/s$/, ''))
  );
}

function wordOverlapScore(a: Set<string>, b: Set<string>): number {
  let score = 0;
  Array.from(a).forEach((word) => {
    if (b.has(word)) score++;
  });
  return score;
}

// Best-effort match between a collection and a blog tag — prefers an exact
// name/slug match, falls back to word overlap (e.g. collection "Vape
// Cartridges" matching tag "vape").
function findMatchingTag(collectionName: string, tags: BlogTag[]): BlogTag | null {
  const normalizedName = collectionName.toLowerCase().trim();
  const exact = tags.find(
    (t) => t.name.toLowerCase().trim() === normalizedName || t.slug === normalizedName.replace(/\s+/g, '-')
  );
  if (exact) return exact;

  const nameWords = toWordSet(collectionName);
  if (nameWords.size === 0) return null;

  let best: BlogTag | null = null;
  let bestScore = 0;
  for (const tag of tags) {
    const score = wordOverlapScore(nameWords, toWordSet(tag.name));
    if (score > bestScore) {
      bestScore = score;
      best = tag;
    }
  }
  return bestScore > 0 ? best : null;
}

// Fallback when no tag matches — score post titles by word overlap with the
// collection name instead.
function rankPostsByTitle(collectionName: string, posts: BlogPostCard[]): BlogPostCard[] {
  const nameWords = toWordSet(collectionName);
  if (nameWords.size === 0) return [];
  return posts
    .map((post) => ({ post, score: wordOverlapScore(nameWords, toWordSet(post.title)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.post);
}

const sortOptions: SelectOption[] = SORT_OPTIONS;
const PAGE_SIZE = 24;

function parsePrice(price?: string): number {
  if (!price) return 0;
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

function productMatchesFilters(product: Product, filters: ActiveFilters): boolean {
  for (const [key, slugs] of Object.entries(filters)) {
    if (slugs.length === 0) continue;
    const connection = FACET_PRODUCT_CONNECTION[key];
    if (!connection) continue;
    const productTerms: Array<{ slug?: string }> = (product as any)?.[connection]?.nodes || [];
    const productSlugs = productTerms.map((t) => t.slug).filter(Boolean);
    if (!slugs.some((s) => productSlugs.includes(s))) return false;
  }
  return true;
}

function sortProducts(products: Product[], sort: string): Product[] {
  const sorted = [...products];
  switch (sort) {
    case 'price-low':
      return sorted.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    case 'price-high':
      return sorted.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    default:
      return sorted;
  }
}

interface CollectionsPageProps {
  collection: Collection;
  allProducts: Product[];
  relatedPosts: BlogPostCard[];
}

export default function CollectionsPage({
  collection,
  allProducts,
  relatedPosts,
}: CollectionsPageProps) {
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [selectedSort, setSelectedSort] = useState('default');
  const [page, setPage] = useState(1);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncatable, setDescTruncatable] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!descRef.current) return;
    setDescTruncatable(descRef.current.scrollHeight > descRef.current.clientHeight + 1);
  }, [collection?.description]);

  const filteredProducts = useMemo(() => {
    let result = allProducts;
    if (Object.keys(activeFilters).length > 0) {
      result = result.filter((p) => productMatchesFilters(p, activeFilters));
    }
    return sortProducts(result, selectedSort);
  }, [allProducts, activeFilters, selectedSort]);

  const filterGroups = useMemo(() => deriveFilterGroups(filteredProducts as any[]), [filteredProducts]);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageProducts = filteredProducts.slice(startIdx, startIdx + PAGE_SIZE);
  const hasMore = page < totalPages;
  const hasPrev = page > 1;
  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (key: string, slugs: string[]) => {
    setActiveFilters((prev) => {
      const next = { ...prev, [key]: slugs };
      for (const k of Object.keys(next)) {
        if (next[k].length === 0) delete next[k];
      }
      return next;
    });
    setPage(1);
  };

  const handleSortChange = (option: SelectOption | null) => {
    if (option) {
      setSelectedSort(option.value);
      setPage(1);
    }
  };

  if (!collection) {
    return (
      <Layout title="Collection Not Found">
        <div className={styles.notFound}>
          <h1>Collection Not Found</h1>
          <p>The collection you are looking for does not exist.</p>
          <Link href="/collections" className="btn-primary">View All Collections</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title={collection.name}
      description={collection.description?.replace(/<[^>]+>/g, '').slice(0, 160) || undefined}
      seo={{
        title: collection.seo?.title,
        metaDesc: collection.seo?.metaDesc,
        schema: collection.seo?.schema?.raw,
        opengraphTitle: collection.seo?.opengraphTitle,
        opengraphDescription: collection.seo?.opengraphDescription,
        opengraphImage: collection.seo?.opengraphImage?.sourceUrl,
      }}
    >
      {(() => {
        const heroDesktop = collection.collectionFields?.collectionHeroDesktop?.node;
        const heroMobile = collection.collectionFields?.collectionHeroMobile?.node;
        const desktopSrc = heroDesktop?.sourceUrl || heroMobile?.sourceUrl;
        const mobileSrc = heroMobile?.sourceUrl || heroDesktop?.sourceUrl;
        if (!desktopSrc && !mobileSrc) return null;
        return (
          <div className={styles.hero}>
            {desktopSrc && (
              <div className={`${styles.heroImageWrap} ${styles.heroDesktop}`}>
                <Image
                  src={desktopSrc}
                  alt={heroDesktop?.altText || collection.name}
                  fill
                  priority
                  sizes="100vw"
                  className={styles.heroImage}
                />
              </div>
            )}
            {mobileSrc && (
              <div className={`${styles.heroImageWrap} ${styles.heroMobile}`}>
                <Image
                  src={mobileSrc}
                  alt={heroMobile?.altText || collection.name}
                  fill
                  priority
                  sizes="100vw"
                  className={styles.heroImage}
                />
              </div>
            )}
          </div>
        );
      })()}

      <div className={styles.page}>
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.separator}>/</span>
          <Link href="/collections">Collections</Link>
          <span className={styles.separator}>/</span>
          <span className={styles.current}>{collection.name}</span>
        </nav>

        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.title}>{collection.name}</h1>
            {collection.description && (
              <>
                <div
                  ref={descRef}
                  className={`${styles.description} ${!descExpanded ? styles.descriptionClamped : ''}`}
                  dangerouslySetInnerHTML={{ __html: collection.description }}
                />
                {descTruncatable && (
                  <button
                    type="button"
                    className={styles.descriptionToggle}
                    onClick={() => setDescExpanded((v) => !v)}
                  >
                    {descExpanded ? 'Read less' : 'Read more'}
                  </button>
                )}
              </>
            )}
            {collection.collectionFields?.warningMessage && (
              <p className={styles.warningMessage}>
                <span aria-hidden="true">⚠️</span> {collection.collectionFields.warningMessage}
              </p>
            )}
          </div>
        </header>

        <div className={styles.layout}>
          <div className={styles.sidebarWrapper}>
            <ShopSidebar
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
            />
          </div>

          <main className={styles.main}>
            <div className={styles.controls}>
              <span className={styles.productCount}>
                {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
              </span>
              <div className={styles.sortWrapper}>
                <span className={styles.sortLabel}>Sort by</span>
                <div className={styles.sortSelect}>
                  <Select
                    options={sortOptions}
                    value={currentSort}
                    onChange={handleSortChange}
                    instanceId="collection-sort-select"
                  />
                </div>
              </div>
            </div>

            <MobileFilters
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              productCount={filteredProducts.length}
            />

            <div className='products-grid'>
              {pageProducts.length > 0 ? (
                pageProducts.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 12} />
                ))
              ) : (
                <p className={styles.noProducts}>No products found matching your filters.</p>
              )}
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                {hasPrev ? (
                  <button onClick={() => goToPage(page - 1)} className={styles.pageBtn}>
                    &larr; Previous
                  </button>
                ) : <span />}
                <span className={styles.pageNum}>Page {page} of {totalPages}</span>
                {hasMore ? (
                  <button onClick={() => goToPage(page + 1)} className={styles.pageBtn}>
                    Next &rarr;
                  </button>
                ) : <span />}
              </div>
            )}

            {allProducts.length === 0 && (
              <div className={styles.empty}>
                <p>No products in this collection yet.</p>
                <Link href="/shop" className="btn-secondary">Browse All Products</Link>
              </div>
            )}
          </main>
        </div>

        <div className={styles.reviewsSection}>
          <ReviewsCarousel />
        </div>

        {(() => {
          const related = collection.collectionFields?.relatedCollections?.nodes || [];
          if (related.length === 0) return null;
          const relatedTitle = collection.collectionFields?.relatedCollectionTitle || 'Related Collections';
          return (
            <section className={styles.relatedCollections}>
              <h2 className={styles.relatedCollectionsTitle}>{relatedTitle}</h2>
              <div className={styles.relatedCollectionsTiles}>
                {related.map((rc) => (
                  <Link key={rc.id} href={`/collections/${rc.slug}`} className={styles.relatedCollectionTile}>
                    {rc.collectionFields?.thumbnailImage?.node?.sourceUrl && (
                      <span className={styles.relatedCollectionImageWrap}>
                        <Image
                          src={rc.collectionFields.thumbnailImage.node.sourceUrl}
                          alt={rc.collectionFields.thumbnailImage.node.altText || rc.name}
                          fill
                          sizes="(max-width: 640px) 40vw, 200px"
                          className={styles.relatedCollectionImage}
                        />
                      </span>
                    )}
                    <span className={styles.relatedCollectionLabel}>{rc.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })()}

        <div className={styles.blogPostsSection}>
          <BlogPostsCarousel title="Learn About Our Products" posts={relatedPosts} />
        </div>

        <RecentlyViewed currentSlug="" />
      </div>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({ query: GET_ALL_COLLECTION_SLUGS });
    const paths = data?.collections?.nodes?.map((c: { slug: string }) => ({
      params: { slug: c.slug },
    })) || [];
    return { paths, fallback: 'blocking' };
  } catch {
    return { paths: [], fallback: 'blocking' };
  }
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  try {
    const client = getClient();
    const [menuClient, metaRes, productsRes, tagsRes, latestPostsRes] = await Promise.all([
      prefetchMenus(),
      client.query({
        query: GET_COLLECTION_META,
        variables: { slug },
      }),
      client.query({
        query: GET_COLLECTION_PRODUCTS,
        variables: { first: 500, collectionFilterIn: [slug] },
      }),
      client.query({ query: GET_ALL_TAGS }).catch(() => null),
      client.query({ query: GET_LATEST_POSTS_LITE, variables: { first: 20 } }).catch(() => null),
    ]);

    if (!metaRes.data?.collection) {
      return { notFound: true };
    }

    const collection = metaRes.data.collection;
    const tags: BlogTag[] = tagsRes?.data?.tags?.nodes || [];
    const latestPosts: BlogPostCard[] = latestPostsRes?.data?.posts?.nodes || [];

    // Prefer a matching blog tag (precise); fall back to title word-overlap
    // against the broader recent-posts pool. Either way, if that doesn't add
    // up to 12, top up the remainder with the latest posts (deduplicated)
    // rather than leaving the carousel short.
    const RELATED_POSTS_TARGET = 12;
    let relatedPosts: BlogPostCard[] = [];
    const matchingTag = tags.length ? findMatchingTag(collection.name, tags) : null;
    if (matchingTag) {
      const tagPostsRes = await client
        .query({
          query: GET_LATEST_POSTS_LITE,
          variables: { first: RELATED_POSTS_TARGET, tagSlugIn: [matchingTag.slug] },
        })
        .catch(() => null);
      relatedPosts = tagPostsRes?.data?.posts?.nodes || [];
    }
    if (relatedPosts.length < RELATED_POSTS_TARGET) {
      const usedIds = new Set(relatedPosts.map((p) => p.id));
      const byTitle = rankPostsByTitle(collection.name, latestPosts).filter((p) => !usedIds.has(p.id));
      for (const post of byTitle) {
        if (relatedPosts.length >= RELATED_POSTS_TARGET) break;
        relatedPosts.push(post);
        usedIds.add(post.id);
      }
    }
    if (relatedPosts.length < RELATED_POSTS_TARGET) {
      const usedIds = new Set(relatedPosts.map((p) => p.id));
      for (const post of latestPosts) {
        if (relatedPosts.length >= RELATED_POSTS_TARGET) break;
        if (usedIds.has(post.id)) continue;
        relatedPosts.push(post);
        usedIds.add(post.id);
      }
    }

    const result = {
      props: {
        collection,
        allProducts: productsRes.data?.products?.nodes || [],
        relatedPosts,
      } as Record<string, any>,
      revalidate: 600,
    };
    mergeMenuState(result.props, menuClient);
    return result;
  } catch {
    return { notFound: true };
  }
};
