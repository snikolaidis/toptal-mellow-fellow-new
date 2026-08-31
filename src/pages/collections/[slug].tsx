import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import {
  GET_ALL_COLLECTION_SLUGS,
} from '@/graphql/queries/collections';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { decodeEntities } from '@/lib/decodeEntities';
import { useTaxonomyProducts } from '@/lib/useTaxonomyProducts';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import RichText from '@/components/RichText';
import ReviewsCarousel from '@/wp-blocks/ReviewsCarousel';
import BlogPostsCarousel from '@/components/BlogPostsCarousel';
import FilterPanel from '@/components/shop/filters/FilterPanel';
import FilterSheet from '@/components/shop/filters/FilterSheet';
import Select, { SelectOption } from '@/components/ui/Select';
import { Collection, Product } from '@/types/woocommerce';
import { BlogPostCard } from '@/types/blog';
import {
  FILTER_GROUPS,
  FilterGroup,
  SORT_OPTIONS,
  isHiddenTerm,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/collection.module.css';
import gridStyles from '@/styles/shared/product-grid.module.css';

const RecentlyViewed = dynamic(() => import('@/components/pdp/RecentlyViewed'), { ssr: false });

const sortOptions: SelectOption[] = SORT_OPTIONS;

// Deliberately not the shared PAGE_SIZE of 24. Matches the mood pages.
const COLLECTION_PAGE_SIZE = 12;

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
  const {
    products,
    filterGroups,
    loading,
    activeFilters,
    currentSort,
    page,
    hasNextPage,
    totalPages,
    isFiltered,
    handleFilterChange,
    handleSortChange,
    goToNextPage,
    goToPrevPage,
  } = useTaxonomyProducts({
    slug: collectionSlug,
    taxonomy: 'collection',
    pageSize: COLLECTION_PAGE_SIZE,
    initialProducts,
    initialFilterGroups,
    initialHasNextPage,
    initialTotalPages,
  });

  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncatable, setDescTruncatable] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!descRef.current) return;
    setDescTruncatable(descRef.current.scrollHeight > descRef.current.clientHeight + 1);
  }, [collection?.description]);

  const displayCount = isFiltered ? products.length : totalProducts;

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
          <div className={`${styles.sidebarWrapper} ${styles.filterCard}`}>
            {/* Without the key, accordions opened on one collection stay open
                on the next: React reuses the component across navigation. */}
            <FilterPanel
              key={collectionSlug}
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              sortValue={currentSort}
              onSortChange={handleSortChange}
              showSort={false}
            />
          </div>

          <main className={styles.main}>
            <div className={styles.controls}>
              <span className={styles.productCount}>
                {isFiltered
                  ? `${displayCount}${hasNextPage ? '+' : ''} ${displayCount === 1 ? 'product' : 'products'}`
                  : `${totalProducts} ${totalProducts === 1 ? 'product' : 'products'}`}
              </span>
              <div className={styles.sortWrapperDesktop}>
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

            <FilterSheet
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              productCount={displayCount}
              sortValue={currentSort}
              onSortChange={handleSortChange}
            />

            <div className={`${gridStyles.productGrid} ${loading ? styles.gridLoading : ''}`}>
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
                {related.map((rc) => {
                  const rcName = decodeEntities(rc.name);
                  return (
                    <Link key={rc.id} href={`/collections/${rc.slug}`} className={styles.relatedCollectionTile}>
                      {rc.collectionFields?.thumbnailImage?.node?.sourceUrl && (
                        <span className={styles.relatedCollectionImageWrap}>
                          <Image
                            src={rc.collectionFields.thumbnailImage.node.sourceUrl}
                            alt={rc.collectionFields.thumbnailImage.node.altText || rcName}
                            fill
                            sizes="(max-width: 640px) 40vw, 200px"
                            className={styles.relatedCollectionImage}
                          />
                        </span>
                      )}
                      <span className={styles.relatedCollectionLabel}>{rcName}</span>
                    </Link>
                  );
                })}
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
      fetch(`${wpUrl}/wp-json/mf/v1/collection-products?slug=${encodeURIComponent(slug)}&per_page=${COLLECTION_PAGE_SIZE}`)
        .then((r) => r.json())
        .catch(() => null),
    ]);

    if (!metaRes?.success || !metaRes?.collection) {
      return { notFound: true };
    }

    const raw = metaRes.collection;

    // `description` must not be added here: it is real HTML rendered with
    // dangerouslySetInnerHTML, so decoding it turns escaped markup into live
    // markup.
    const collection: Collection = {
      ...raw,
      name: decodeEntities(raw.name),
      // `faqs.nodes[].content` is left alone for the same reason as
      // `description`: it renders through RichText as real HTML.
      collectionFields: raw.collectionFields
        ? {
            ...raw.collectionFields,
            warningMessage: decodeEntities(raw.collectionFields.warningMessage),
            relatedCollectionTitle: decodeEntities(
              raw.collectionFields.relatedCollectionTitle
            ),
            faqSectionTitle: decodeEntities(raw.collectionFields.faqSectionTitle),
            faqs: raw.collectionFields.faqs
              ? {
                  ...raw.collectionFields.faqs,
                  nodes: (raw.collectionFields.faqs.nodes ?? []).map(
                    (faq: { id: string; title: string; content: string }) => ({
                      ...faq,
                      title: decodeEntities(faq.title),
                    })
                  ),
                }
              : raw.collectionFields.faqs,
          }
        : raw.collectionFields,
      seo: raw.seo
        ? {
            ...raw.seo,
            title: decodeEntities(raw.seo.title),
            opengraphTitle: decodeEntities(raw.seo.opengraphTitle),
          }
        : raw.seo,
    };

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
    const initialTotalPages = productsRes?.totalPages || (totalProducts > 0 ? Math.ceil(totalProducts / COLLECTION_PAGE_SIZE) : 0);

    // Related posts are matched server-side via the mu-plugin (mellow-fellow-related-posts.php)
    // and returned on the endpoint payload, not on the Collection type, so this
    // reads from `raw` rather than the annotated `collection`.
    const relatedPosts: BlogPostCard[] = raw.relatedPosts || [];

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
