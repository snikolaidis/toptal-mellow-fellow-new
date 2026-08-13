import { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import { GET_ALL_MOOD_SLUGS } from '@/graphql/queries/moods';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { decodeEntities } from '@/lib/decodeEntities';
import { useTaxonomyProducts } from '@/lib/useTaxonomyProducts';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import RichText from '@/components/RichText';
import ReviewsCarousel from '@/wp-blocks/ReviewsCarousel';
import BlogPostsCarousel from '@/components/BlogPostsCarousel';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Product } from '@/types/woocommerce';
import { Mood } from '@/types/mood';
import { BlogPostCard } from '@/types/blog';
import {
  PAGE_SIZE,
  SORT_OPTIONS,
  FILTER_GROUPS,
  FilterGroup,
  isHiddenTerm,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/collection.module.css';
import moodStyles from '@/styles/pages/mood.module.css';

const RecentlyViewed = dynamic(() => import('@/components/pdp/RecentlyViewed'), { ssr: false });

const sortOptions: SelectOption[] = SORT_OPTIONS;

interface MoodPageProps {
  mood: Mood;
  initialProducts: Product[];
  initialFilterGroups: FilterGroup[];
  totalProducts: number;
  initialHasNextPage: boolean;
  initialTotalPages: number;
  moodSlug: string;
  relatedPosts: BlogPostCard[];
}

export default function MoodPage({
  mood,
  initialProducts,
  initialFilterGroups,
  totalProducts,
  initialHasNextPage,
  initialTotalPages,
  moodSlug,
  relatedPosts,
}: MoodPageProps) {
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
    slug: moodSlug,
    taxonomy: 'mood',
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
  }, [mood?.description]);

  if (!mood) {
    return (
      <Layout title="Mood Not Found">
        <div className={styles.notFound}>
          <h1>Mood Not Found</h1>
          <p>The mood you are looking for does not exist.</p>
          <Link href="/shop" className="btn-primary">Browse All Products</Link>
        </div>
      </Layout>
    );
  }

  const isEmpty = totalProducts === 0;
  const displayCount = isFiltered ? products.length : totalProducts;

  const heroDesktop = mood.moodFields?.moodHeroDesktop?.node;
  const heroMobile = mood.moodFields?.moodHeroMobile?.node;
  const desktopSrc = heroDesktop?.sourceUrl || heroMobile?.sourceUrl;
  const mobileSrc = heroMobile?.sourceUrl || heroDesktop?.sourceUrl;
  const hasHero = Boolean(desktopSrc || mobileSrc);

  // With a banner the overlaid name is the h1, so this heading is a second-level
  // repeat. Without one it is the page's only heading and has to be the h1.
  const SectionHeading = hasHero ? 'h2' : 'h1';

  return (
    <Layout
      title={mood.name}
      description={mood.description?.replace(/<[^>]+>/g, '').slice(0, 160) || undefined}
      seo={{
        title: mood.seo?.title,
        metaDesc: mood.seo?.metaDesc,
        schema: mood.seo?.schema?.raw,
        opengraphTitle: mood.seo?.opengraphTitle,
        opengraphDescription: mood.seo?.opengraphDescription,
        opengraphImage: mood.seo?.opengraphImage?.sourceUrl,
      }}
    >
      {isEmpty && (
        <Head>
          <meta name="robots" content="noindex,follow" />
        </Head>
      )}

      <div className={moodStyles.page}>
        {hasHero && (
          <div className={moodStyles.hero}>
            {desktopSrc && (
              <div className={`${moodStyles.heroImageWrap} ${moodStyles.heroDesktop}`}>
                <Image
                  src={desktopSrc}
                  alt={heroDesktop?.altText || ''}
                  fill
                  priority
                  sizes="calc(100vw - 120px)"
                  className={moodStyles.heroImage}
                />
              </div>
            )}
            {mobileSrc && (
              <div className={`${moodStyles.heroImageWrap} ${moodStyles.heroMobile}`}>
                <Image
                  src={mobileSrc}
                  alt={heroMobile?.altText || ''}
                  fill
                  priority
                  sizes="calc(100vw - 32px)"
                  className={moodStyles.heroImage}
                />
              </div>
            )}
            <h1 className={moodStyles.heroTitle}>{mood.name}</h1>
          </div>
        )}

        <nav className={moodStyles.breadcrumb}>
          <Link href="/shop">Shop</Link>
          <span className={moodStyles.separator}>/</span>
          <span className={moodStyles.crumb}>Moods</span>
          <span className={moodStyles.separator}>/</span>
          <span className={moodStyles.current}>{mood.name}</span>
        </nav>

        <header className={moodStyles.header}>
          <SectionHeading className={moodStyles.sectionTitle}>{mood.name}</SectionHeading>
          {mood.description && (
            <>
              <div
                ref={descRef}
                className={`${moodStyles.sentence} ${!descExpanded ? moodStyles.sentenceClamped : ''}`}
                dangerouslySetInnerHTML={{ __html: mood.description }}
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
          {mood.moodFields?.warningMessage && (
            <p className={styles.warningMessage}>
              <span aria-hidden="true">⚠️</span> {mood.moodFields.warningMessage}
            </p>
          )}
        </header>

        {isEmpty ? (
          <section className={moodStyles.emptyState}>
            <h2 className={moodStyles.emptyTitle}>Still curating this mood</h2>
            <p className={moodStyles.emptyBody}>
              We are picking the products for {mood.name} now, and they will show up
              here as soon as they land. The full range is a good place to start in
              the meantime.
            </p>
            <div className={moodStyles.emptyActions}>
              <Link href="/shop" className="btn-primary">Browse all products</Link>
              <Link href="/collections" className={moodStyles.emptyLink}>
                See all collections
              </Link>
            </div>
          </section>
        ) : (
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
                      instanceId="mood-sort-select"
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
            </main>
          </div>
        )}

        <div className={styles.reviewsSection}>
          <ReviewsCarousel />
        </div>

        <div className={styles.blogPostsSection}>
          <BlogPostsCarousel title="Learn About Our Products" posts={relatedPosts} />
        </div>

        {(() => {
          const faqs = mood.moodFields?.faqs?.nodes || [];
          if (faqs.length === 0) return null;
          const faqTitle = mood.moodFields?.faqSectionTitle || 'Frequently Asked Questions';
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
    const { data } = await client.query({ query: GET_ALL_MOOD_SLUGS });
    const paths = data?.moods?.nodes?.map((m: { slug: string }) => ({
      params: { slug: m.slug },
    })) || [];
    return { paths, fallback: 'blocking' };
  } catch (err) {
    console.error('Failed to fetch mood slugs:', err);
    return { paths: [], fallback: 'blocking' };
  }
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  try {
    const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const qs = `slug=${encodeURIComponent(slug)}&taxonomy=mood`;

    const [menuClient, metaRes, facetsRes, productsRes] = await Promise.all([
      prefetchMenus(),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-meta?${qs}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-facets?${qs}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-products?${qs}&per_page=${PAGE_SIZE}`)
        .then((r) => r.json())
        .catch(() => null),
    ]);

    // `mood`, not `collection`: the endpoint keys the term by its taxonomy
    // (mellow-fellow-collection-meta.php:190). Reading `.collection` here is
    // undefined on every request and 404s all six pages.
    if (!metaRes?.success || !metaRes?.mood) {
      return { notFound: true, revalidate: 60 };
    }

    const raw = metaRes.mood;

    // `description` must not be added here: it is real HTML rendered with
    // dangerouslySetInnerHTML, so decoding it turns escaped markup into live
    // markup.
    const mood: Mood = {
      ...raw,
      name: decodeEntities(raw.name),
      seo: raw.seo
        ? {
            ...raw.seo,
            title: decodeEntities(raw.seo.title),
            opengraphTitle: decodeEntities(raw.seo.opengraphTitle),
          }
        : raw.seo,
    };

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

    const relatedPosts: BlogPostCard[] = mood.relatedPosts || [];

    const result = {
      props: {
        mood,
        initialProducts,
        initialFilterGroups: filterGroupsData,
        totalProducts,
        initialHasNextPage,
        initialTotalPages,
        moodSlug: slug,
        relatedPosts,
      } as Record<string, any>,
      revalidate: 60,
    };
    mergeMenuState(result.props, menuClient);
    return result;
  } catch (err) {
    console.error('Failed to fetch mood:', err);
    // Without revalidate, one WordPress blip caches this 404 with no expiry and
    // only a redeploy clears it.
    return { notFound: true, revalidate: 60 };
  }
};
