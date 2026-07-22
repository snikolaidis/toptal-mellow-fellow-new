import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import {
  GET_ALL_COLLECTION_SLUGS,
} from '@/graphql/queries/collections';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import RichText from '@/components/RichText';
import ReviewsCarousel from '@/wp-blocks/ReviewsCarousel';
import BlogPostsCarousel from '@/components/BlogPostsCarousel';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Collection, Product } from '@/types/woocommerce';
import { BlogPostCard } from '@/types/blog';
import {
  SORT_OPTIONS,
  FILTER_GROUPS,
  ActiveFilters,
  FilterGroup,
  isHiddenTerm,
  parseFilterParams,
  filtersToQueryParams,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/collection.module.css';

const RecentlyViewed = dynamic(() => import('@/components/pdp/RecentlyViewed'), { ssr: false });


const sortOptions: SelectOption[] = SORT_OPTIONS;
const PAGE_SIZE = 24;

interface CollectionsPageProps {
  collection: Collection;
  initialProducts: Product[];
  initialFilterGroups: FilterGroup[];
  totalProducts: number;
  initialHasNextPage: boolean;
  initialTotalPages: number;
  collectionSlug: string;
  relatedPosts: BlogPostCard[];
}

export default function CollectionsPage({
  collection,
  initialProducts,
  initialFilterGroups,
  totalProducts,
  initialHasNextPage,
  initialTotalPages,
  collectionSlug,
  relatedPosts,
}: CollectionsPageProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(initialFilterGroups);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [selectedSort, setSelectedSort] = useState('default');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [currentTotalPages, setCurrentTotalPages] = useState(initialTotalPages);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncatable, setDescTruncatable] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  const usingInitialData = useRef(true);

  useEffect(() => {
    if (!descRef.current) return;
    setDescTruncatable(descRef.current.scrollHeight > descRef.current.clientHeight + 1);
  }, [collection?.description]);

  const fetchPage = useCallback(
    async (filters: ActiveFilters, sort: string, targetPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('first', String(PAGE_SIZE));
        params.set('collection', collectionSlug);
        params.set('page', String(targetPage));
        if (sort !== 'default') params.set('sort', sort);

        for (const [key, slugs] of Object.entries(filters)) {
          if (slugs.length > 0) params.set(key, slugs.join(','));
        }

        const res = await fetch(`/api/shop/products?${params.toString()}`);
        const data = await res.json();

        if (data.success) {
          setProducts(data.products || []);
          setHasNextPage(data.hasNextPage || false);
          setCurrentTotalPages(data.totalPages || 1);
          usingInitialData.current = false;
        }
      } catch {
        // keep current products on network error
      } finally {
        setLoading(false);
      }
    },
    [collectionSlug]
  );

  // Reset state when navigating between collections (React reuses the component)
  // and apply any URL filter/sort params
  useEffect(() => {
    setProducts(initialProducts);
    setFilterGroups(initialFilterGroups);
    setActiveFilters({});
    setSelectedSort('default');
    setPage(1);
    setHasNextPage(initialHasNextPage);
    setCurrentTotalPages(initialTotalPages);
    setLoading(false);
    usingInitialData.current = true;

    if (!router.isReady) return;
    const urlFilters = parseFilterParams(router.query as Record<string, string | string[] | undefined>);
    const urlSort = typeof router.query.sort === 'string' ? router.query.sort : 'default';
    if (Object.keys(urlFilters).length > 0 || urlSort !== 'default') {
      setActiveFilters(urlFilters);
      setSelectedSort(urlSort);
      fetchPage(urlFilters, urlSort, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionSlug]);

  const handleFilterChange = useCallback(
    (key: string, slugs: string[]) => {
      setActiveFilters((prev) => {
        const next = { ...prev, [key]: slugs };
        for (const k of Object.keys(next)) {
          if (next[k].length === 0) delete next[k];
        }

        const noFilters = Object.keys(next).length === 0 && selectedSort === 'default';
        if (noFilters && usingInitialData.current === false) {
          setProducts(initialProducts);
          setFilterGroups(initialFilterGroups);
          setHasNextPage(initialHasNextPage);
          setCurrentTotalPages(initialTotalPages);
          usingInitialData.current = true;
        } else if (!noFilters) {
          fetchPage(next, selectedSort, 1);
        }

        setPage(1);

        const queryParams = filtersToQueryParams(next, selectedSort);
        router.push(
          { pathname: router.pathname, query: { slug: router.query.slug, ...queryParams } },
          undefined,
          { shallow: true }
        );

        return next;
      });
    },
    [selectedSort, fetchPage, initialProducts, initialFilterGroups, initialHasNextPage, initialTotalPages, router]
  );

  const handleSortChange = useCallback(
    (option: SelectOption | null) => {
      if (!option) return;
      const newSort = option.value;
      setSelectedSort(newSort);
      setPage(1);

      const noFilters = Object.keys(activeFilters).length === 0 && newSort === 'default';
      if (noFilters) {
        setProducts(initialProducts);
        setFilterGroups(initialFilterGroups);
        setHasNextPage(initialHasNextPage);
        setCurrentTotalPages(initialTotalPages);
        usingInitialData.current = true;
      } else {
        fetchPage(activeFilters, newSort, 1);
      }

      const queryParams = filtersToQueryParams(activeFilters, newSort);
      router.push(
        { pathname: router.pathname, query: { slug: router.query.slug, ...queryParams } },
        undefined,
        { shallow: true }
      );
    },
    [activeFilters, fetchPage, initialProducts, initialFilterGroups, initialHasNextPage, initialTotalPages, router]
  );

  const goToNextPage = useCallback(() => {
    if (!hasNextPage || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(activeFilters, selectedSort, nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, hasNextPage, loading, activeFilters, selectedSort, fetchPage]);

  const goToPrevPage = useCallback(() => {
    if (page <= 1 || loading) return;
    const prevPage = page - 1;

    if (prevPage === 1 && Object.keys(activeFilters).length === 0 && selectedSort === 'default') {
      setPage(1);
      setProducts(initialProducts);
      setHasNextPage(initialHasNextPage);
      setCurrentTotalPages(initialTotalPages);
      usingInitialData.current = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setPage(prevPage);
    fetchPage(activeFilters, selectedSort, prevPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, loading, activeFilters, selectedSort, fetchPage, initialProducts, initialHasNextPage, initialTotalPages]);

  const isFiltered = Object.keys(activeFilters).length > 0 || selectedSort !== 'default';
  const displayCount = isFiltered ? products.length : totalProducts;
  const totalPages = currentTotalPages;
  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

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
                {isFiltered
                  ? `${displayCount}${hasNextPage ? '+' : ''} ${displayCount === 1 ? 'product' : 'products'}`
                  : `${totalProducts} ${totalProducts === 1 ? 'product' : 'products'}`}
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
              productCount={displayCount}
            />

            <div className={`products-grid ${loading ? styles.gridLoading : ''}`}>
              {products.length > 0 ? (
                products.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 12} />
                ))
              ) : (
                <p className={styles.noProducts}>No products found matching your filters.</p>
              )}
            </div>

            {(page > 1 || hasNextPage) && (
              <div className={styles.pagination}>
                {page > 1 ? (
                  <button onClick={goToPrevPage} className={styles.pageBtn} disabled={loading}>
                    &larr; Previous
                  </button>
                ) : <span />}
                <span className={styles.pageNum}>
                  Page {page}{totalPages > 1 ? ` of ${totalPages}` : ''}
                </span>
                {hasNextPage ? (
                  <button onClick={goToNextPage} className={styles.pageBtn} disabled={loading}>
                    Next &rarr;
                  </button>
                ) : <span />}
              </div>
            )}

            {totalProducts === 0 && (
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

        {(() => {
          const faqs = collection.collectionFields?.faqs?.nodes || [];
          if (faqs.length === 0) return null;
          const faqTitle = collection.collectionFields?.faqSectionTitle || 'Frequently Asked Questions';
          return (
            <section className={styles.faqSection}>
              <h2 className={styles.faqTitle}>{faqTitle}</h2>
              {faqs.map((faq) => (
                <details key={faq.id} className={styles.faqItem}>
                  <summary>{faq.title}</summary>
                  <RichText as="div" className={styles.faqAnswer} html={faq.content} />
                </details>
              ))}
            </section>
          );
        })()}

        <RecentlyViewed currentSlug="" titleClassName={styles.recentlyViewedTitle} />
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
  } catch (err) {
    console.error('Failed to fetch collection slugs:', err);
    return { paths: [], fallback: 'blocking' };
  }
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  try {
    const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

    const [menuClient, metaRes, facetsRes, productsRes] = await Promise.all([
      prefetchMenus(),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-meta?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-facets?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-products?slug=${encodeURIComponent(slug)}&per_page=${PAGE_SIZE}`)
        .then((r) => r.json())
        .catch(() => null),
    ]);

    if (!metaRes?.success || !metaRes?.collection) {
      return { notFound: true };
    }

    const collection = metaRes.collection;

    // Facets from REST endpoint (single SQL query, ~10ms)
    const facetTerms = facetsRes?.success ? facetsRes.terms : {};
    const totalProducts = facetsRes?.success ? facetsRes.totalProducts : 0;
    const filterGroupsData: FilterGroup[] = FILTER_GROUPS.map((fg) => {
      const terms = facetTerms[fg.key] || [];
      return {
        key: fg.key,
        label: fg.label,
        terms: terms.filter((t: { name: string; slug: string }) => !isHiddenTerm(fg.key, t)),
      };
    });

    const initialProducts = productsRes?.products || [];
    const initialHasNextPage = productsRes?.hasNextPage || false;
    const initialTotalPages = productsRes?.totalPages || (totalProducts > 0 ? Math.ceil(totalProducts / PAGE_SIZE) : 0);

    // Related posts are matched server-side via the mu-plugin (mellow-fellow-related-posts.php)
    // and exposed on the Collection type as `relatedPosts`.
    const relatedPosts: BlogPostCard[] = collection.relatedPosts || [];

    const result = {
      props: {
        collection,
        initialProducts,
        initialFilterGroups: filterGroupsData,
        totalProducts,
        initialHasNextPage,
        initialTotalPages,
        collectionSlug: slug,
        relatedPosts,
      } as Record<string, any>,
      revalidate: 600,
    };
    mergeMenuState(result.props, menuClient);
    return result;
  } catch (err) {
    console.error('Failed to fetch collection:', err);
    return { notFound: true };
  }
};
