import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import { isBuildPhase, warmWordPress } from '@/lib/buildPhase';
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
import Pagination from '@/components/ui/Pagination';
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
    goToPage,
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

      <div className="container">
        <h1 className="collection__title">
          {collection.name}
        </h1>

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

        <nav className="breadcrumb" aria-label="breadcrumbs">
          <ul>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/collections">Collections</Link>
            </li>
            <li className="is-active">
              <a href="" aria-current="page">
                {collection.name}
              </a>
            </li>
          </ul>
        </nav>

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

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              disabled={loading}
              label="Collection pagination"
            />

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

// WPGraphQL silently clamps an oversized `first` to its connection cap, so the
// slug list is paged rather than fetched in one request.
const SLUG_PAGE_SIZE = 100;
const SLUG_MAX_PAGES = 20;

type CollectionSlugPage = {
  collections?: {
    nodes?: { slug: string; count: number | null }[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

export const getStaticPaths: GetStaticPaths = async () => {
  // Before the slug query, not after: that query has no retry of its own.
  await warmWordPress();

  try {
    const client = getClient();
    const paths: { params: { slug: string } }[] = [];
    let after: string | null = null;
    let page = 0;

    for (; page < SLUG_MAX_PAGES; page++) {
      const variables: { first: number; after: string | null } = {
        first: SLUG_PAGE_SIZE,
        after,
      };
      const { data } = await client.query<CollectionSlugPage>({
        query: GET_ALL_COLLECTION_SLUGS,
        variables,
      });

      const connection: CollectionSlugPage['collections'] = data?.collections;
      const nodes = connection?.nodes ?? [];

      for (const node of nodes) {
        if ((node.count ?? 0) > 0) paths.push({ params: { slug: node.slug } });
      }

      if (!connection?.pageInfo?.hasNextPage) break;
      after = connection.pageInfo.endCursor;
    }

    if (page === SLUG_MAX_PAGES) {
      console.warn(
        `Collection slugs: stopped at the ${SLUG_MAX_PAGES} page cap, remaining collections render on demand.`
      );
    }

    return { paths, fallback: 'blocking' };
  } catch (err) {
    console.error('Failed to fetch collection slugs:', err);
    return { paths: [], fallback: 'blocking' };
  }
};

type RestResponse = { status: number; body: any };

// A healthy call is well under a second. Three attempts plus backoff stay inside
// the 25s deadline, which sits inside the 30s Atlas ceiling on a render.
const RUNTIME_REQUEST_TIMEOUT_MS = 8_000;
const RUNTIME_RETRY_ATTEMPTS = 3;
const RUNTIME_FETCH_DEADLINE_MS = 25_000;

// No Atlas request in a build, so that ceiling does not apply: the only limit
// is Next's staticPageGenerationTimeout, 120s in next.config.js. The
// per-request timeout must rise with the attempts, since an 8s abort cuts every
// attempt off before a cold backend answering in 12 to 30s can land one.
const BUILD_REQUEST_TIMEOUT_MS = 25_000;
const BUILD_RETRY_ATTEMPTS = 4;
const BUILD_FETCH_DEADLINE_MS = 70_000;

const RETRY_BASE_MS = 250;
const RETRY_CAP_MS = 2_000;

class NonRetryableError extends Error {}

// Every other 4xx is deterministic: retrying a rejected parameter only burns the
// deadline and buries the message that says what is actually wrong.
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

// Full jitter, so retries from concurrently rendering pages do not line up.
function backoffWithFullJitter(attempt: number): number {
  const ceiling = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
  return Math.random() * ceiling;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The only failure collection-meta returns (mellow-fellow-collection-meta.php:67).
// facets and products answer 200/`success: true` even for an unknown slug.
const isGenuineNotFound = (res: RestResponse) =>
  res.status === 404 && res.body?.success === false;

/**
 * A PHP fatal returns an empty 200, so an unparseable body is retried whatever
 * its status. A genuine 404 is returned instead: that answer will not change.
 */
async function fetchRest(label: string, url: string): Promise<RestResponse> {
  const buildPhase = isBuildPhase();
  const maxAttempts = buildPhase ? BUILD_RETRY_ATTEMPTS : RUNTIME_RETRY_ATTEMPTS;
  const requestTimeoutMs = buildPhase
    ? BUILD_REQUEST_TIMEOUT_MS
    : RUNTIME_REQUEST_TIMEOUT_MS;
  const deadlineAt =
    Date.now() + (buildPhase ? BUILD_FETCH_DEADLINE_MS : RUNTIME_FETCH_DEADLINE_MS);
  let lastError: Error = new Error('request never attempted');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let retryAfterMs: number | null = null;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
      const body = await res.json().catch(() => null);
      const parsed: RestResponse = { status: res.status, body };

      if (res.status === 200 && body?.success === true) return parsed;
      if (isGenuineNotFound(parsed)) return parsed;

      if (!isRetryableStatus(res.status) && body !== null) {
        throw new NonRetryableError(`${label} responded ${res.status}`);
      }

      retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      lastError = new Error(
        body === null
          ? `${label} returned an unparseable body (status ${res.status})`
          : `${label} responded ${res.status}`
      );
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt === maxAttempts) break;

    const waitMs = retryAfterMs ?? backoffWithFullJitter(attempt);

    if (Date.now() + waitMs >= deadlineAt) {
      throw new Error(`${lastError.message} (deadline reached after ${attempt} attempt(s))`);
    }

    console.warn(
      `  ${label}: attempt ${attempt} of ${maxAttempts} failed (${lastError.message}), retrying in ${Math.round(waitMs)}ms`
    );
    await sleep(waitMs);
  }

  throw new Error(`${lastError.message} (after ${maxAttempts} attempts)`);
}

const BUILD_FALLTHROUGH_REVALIDATE = 10;

function requireUsable(name: string, res: RestResponse, slug: string): void {
  if (res.status === 200 && res.body?.success === true) return;
  const body = res.body === null ? 'unparseable' : JSON.stringify(res.body).slice(0, 200);
  throw new Error(
    `mf/v1/${name} unusable for collection "${slug}": status ${res.status}, body ${body}`
  );
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  try {
    const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

    const qs = `slug=${encodeURIComponent(slug)}`;

    const [menuClient, metaRes, facetsRes, productsRes] = await Promise.all([
      prefetchMenus(),
      fetchRest('collection-meta', `${wpUrl}/wp-json/mf/v1/collection-meta?${qs}`),
      fetchRest('collection-facets', `${wpUrl}/wp-json/mf/v1/collection-facets?${qs}`),
      fetchRest(
        'collection-products',
        `${wpUrl}/wp-json/mf/v1/collection-products?${qs}&per_page=${COLLECTION_PAGE_SIZE}`
      ),
    ]);

    if (isGenuineNotFound(metaRes)) {
      return { notFound: true, revalidate: 600 };
    }

    // Throwing rather than 404ing is deliberate: ISR then keeps serving the last
    // good copy instead of recording a 404 that outlives the outage.
    requireUsable('collection-meta', metaRes, slug);
    requireUsable('collection-facets', facetsRes, slug);
    requireUsable('collection-products', productsRes, slug);

    if (!metaRes.body.collection) {
      throw new Error(`mf/v1/collection-meta returned no collection for "${slug}"`);
    }

    const raw = metaRes.body.collection;

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
    const facetTerms = facetsRes.body.terms ?? {};
    const totalProducts = facetsRes.body.totalProducts ?? 0;
    const filterGroupsData: FilterGroup[] = FILTER_GROUPS.map((fg) => {
      const terms = facetTerms[fg.key] || [];
      return {
        key: fg.key,
        label: fg.label,
        terms: terms.filter((t: { name: string; slug: string }) => !isHiddenTerm(fg.key, t)),
      };
    });

    const initialProducts = productsRes.body.products ?? [];
    const initialHasNextPage = productsRes.body.hasNextPage ?? false;
    const initialTotalPages = productsRes.body.totalPages || (totalProducts > 0 ? Math.ceil(totalProducts / COLLECTION_PAGE_SIZE) : 0);

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
    console.error(`Failed to build collection "${slug}":`, err);

    // A throw here would fail the whole deploy, so the build phase records a
    // notFound. That does not defer to `fallback: 'blocking'`: the path is in
    // the prerender manifest, so the 404 is baked in, served until a
    // revalidation succeeds, and re-armed by every failed one.
    if (isBuildPhase()) {
      return { notFound: true, revalidate: BUILD_FALLTHROUGH_REVALIDATE };
    }

    throw err;
  }
};