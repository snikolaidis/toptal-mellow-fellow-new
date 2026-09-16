import { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { ComponentProps, CSSProperties, useEffect, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import { getClient } from '@/lib/apollo-client';
import { GET_ALL_MOOD_SLUGS, GET_ALL_MOODS } from '@/graphql/queries/moods';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { decodeEntities } from '@/lib/decodeEntities';
import { getProductIcon } from '@/lib/productIcons';
import { useTaxonomyProducts } from '@/lib/useTaxonomyProducts';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import RichText from '@/components/RichText';
import CollectionSlider from '@/wp-blocks/CollectionSlider';
import BlogPosts from '@/wp-blocks/BlogPosts';
import LoyaltyTiers from '@/wp-blocks/LoyaltyTiers';
import YouMayAlsoLike from '@/components/pdp/YouMayAlsoLike';
import FilterPanel from '@/components/shop/filters/FilterPanel';
import FilterSheet from '@/components/shop/filters/FilterSheet';
import Select, { SelectOption } from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import { Product } from '@/types/woocommerce';
import { Mood, MoodPill } from '@/types/mood';
import {
  FILTER_GROUPS,
  FilterGroup,
  SORT_OPTIONS,
  isHiddenTerm,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/collection.module.css';
import moodStyles from '@/styles/pages/mood.module.css';
import gridStyles from '@/styles/shared/product-grid.module.css';

const MOOD_PAGE_SIZE = 12;

const sortOptions: SelectOption[] = SORT_OPTIONS;

interface CategoryChip {
  slug: string;
  label: string;
  glowColor: string;
  glowSize: number;
  glowBlur: number;
  glowOpacity: number;
}

const CATEGORY_CHIPS: CategoryChip[] = [
  { slug: 'flower', label: 'Flower', glowColor: '#DD6E7A', glowSize: 63.156, glowBlur: 13.85, glowOpacity: 0.8 },
  { slug: 'disposable-vapes', label: 'Vapes', glowColor: '#207685', glowSize: 63.156, glowBlur: 13.5, glowOpacity: 0.46 },
  { slug: 'edibles', label: 'Edibles', glowColor: '#A1B28F', glowSize: 63.156, glowBlur: 13.5, glowOpacity: 1 },
  { slug: 'drinks', label: 'Drinks', glowColor: '#FFCC4F', glowSize: 56, glowBlur: 13.5, glowOpacity: 0.92 },
  { slug: 'vape-cartridges', label: 'Carts', glowColor: '#A997BB', glowSize: 63.156, glowBlur: 13.5, glowOpacity: 0.79 },
  { slug: 'concentrates', label: 'Concentrates', glowColor: '#E08A45', glowSize: 63.156, glowBlur: 13.5, glowOpacity: 0.8 },
];

const MOOD_ORDER = [
  'sleep-better',
  'relief',
  'chill-out',
  'energy-focus',
  'happy-social',
  'better-intimacy',
];

const moodRank = (slug: string) => {
  const i = MOOD_ORDER.indexOf(slug);
  return i === -1 ? MOOD_ORDER.length : i;
};

// Same copy the homepage holds in ACF. Editing the homepage block does not
// reach these, so the two drift apart silently.
const BESTSELLERS_SLIDER = {
  title: "Explore this Month's Bestsellers",
  productCount: 8,
  backgroundVariant: 'green_panel',
  collection: { nodes: [{ __typename: 'Collection', slug: 'best-sellers' }] },
};

const BLOG_POSTS = {
  title: 'New to THC? Start Here',
  subheading: 'Quick reads for first-time buyers.',
  postCount: 5,
  buttonText: 'Browse All Blogs',
  buttonLink: { url: '/blogs' },
};

// LoyaltyTiers.fragments is `on AcfLoyaltyTiers`, so it cannot be reused against
// Site Settings, which registers the same field names under its own type
// (mellow-fellow-site-settings.php:457). Keep the two selections in step: a field
// added to the block fragment is silently absent here.
const GET_LOYALTY_TIERS = gql`
  query GetMoodLoyaltyTiers {
    siteSettings {
      id
      loyaltyTiers {
        badgeText
        heading
        body
        tiersTitle
        cta {
          url
          title
          target
        }
        badgeIcon {
          node {
            id
            altText
            sourceUrl
          }
        }
        tiers {
          name
          points
          iconBg
          icon {
            node {
              id
              altText
              sourceUrl
            }
          }
          benefits {
            label
            icon {
              node {
                id
                altText
                sourceUrl
              }
            }
          }
        }
      }
    }
  }
`;

type LoyaltyTiersData = ComponentProps<typeof LoyaltyTiers>['loyaltyTiers'];

interface MoodPageProps {
  mood: Mood;
  moodPills: MoodPill[];
  initialProducts: Product[];
  initialFilterGroups: FilterGroup[];
  totalProducts: number;
  initialHasNextPage: boolean;
  initialTotalPages: number;
  moodSlug: string;
  loyaltyTiers: LoyaltyTiersData;
}

export default function MoodPage({
  mood,
  moodPills,
  initialProducts,
  initialFilterGroups,
  totalProducts,
  initialHasNextPage,
  initialTotalPages,
  moodSlug,
  loyaltyTiers,
}: MoodPageProps) {
  const {
    products,
    filterGroups,
    loading,
    activeFilters,
    priceRange,
    currentSort,
    page,
    hasNextPage,
    totalPages,
    filteredTotal,
    isFiltered,
    handleFilterChange,
    handleSortChange,
    handlePriceChange,
    goToPage,
  } = useTaxonomyProducts({
    slug: moodSlug,
    taxonomy: 'mood',
    initialProducts,
    initialFilterGroups,
    initialHasNextPage,
    initialTotalPages,
    pageSize: MOOD_PAGE_SIZE,
  });

  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncatable, setDescTruncatable] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const pillsRowRef = useRef<HTMLElement>(null);
  const activePillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!descRef.current) return;
    setDescTruncatable(descRef.current.scrollHeight > descRef.current.clientHeight + 1);
  }, [mood?.moodFields?.introText]);

  useEffect(() => {
    const row = pillsRowRef.current;
    const active = activePillRef.current;
    if (!row || !active) return;

    const reveal = () => {
      if (row.scrollWidth > row.clientWidth) {
        active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      }
    };

    reveal();

    // The row is 15px wider at mount than once the product grid has taken the
    // vertical scrollbar, so the first pass measures against the wrong width
    // and stops short of the active pill.
    const observer = new ResizeObserver(reveal);
    observer.observe(row);
    observer.observe(active);
    return () => observer.disconnect();
  }, [moodSlug]);

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
  const displayCount = isFiltered && filteredTotal !== null ? filteredTotal : totalProducts;

  const heroDesktop = mood.moodFields?.moodHeroDesktop?.node;
  const heroMobile = mood.moodFields?.moodHeroMobile?.node;
  const desktopSrc = heroDesktop?.sourceUrl || heroMobile?.sourceUrl;
  const mobileSrc = heroMobile?.sourceUrl || heroDesktop?.sourceUrl;
  const hasHero = Boolean(desktopSrc || mobileSrc);

  const pillIndex = moodPills.findIndex((p) => p.slug === moodSlug);
  const nextMood =
    moodPills.length > 1 && pillIndex !== -1
      ? moodPills[(pillIndex + 1) % moodPills.length]
      : null;

  const introHeading = mood.moodFields?.introHeading;
  const introText = mood.moodFields?.introText;
  const warningMessage = mood.moodFields?.warningMessage;
  const hasHeader = Boolean(introHeading || introText || warningMessage);

  // Strip first, decode second. Decoding first turns an escaped "&lt;" into a
  // real "<" and the tag stripper then eats everything up to the next ">", so
  // "THC &lt;0.3% by dry weight" comes out as "THC ".
  const metaDescription = decodeEntities(
    mood.description?.replace(/<[^>]+>/g, '')
  )?.slice(0, 160);

  return (
    <Layout
      title={mood.name}
      description={metaDescription || undefined}
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
        {hasHero ? (
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
        ) : (
          <h1 className={moodStyles.pageTitle}>{mood.name}</h1>
        )}

        <nav className={moodStyles.breadcrumb}>
          <Link href="/shop">Shop</Link>
          <span className={moodStyles.separator}>/</span>
          <span className={moodStyles.crumb}>Moods</span>
          <span className={moodStyles.separator}>/</span>
          <span className={moodStyles.current}>{mood.name}</span>
        </nav>

        <div className={moodStyles.chipsRow}>
          {CATEGORY_CHIPS.map((chip) => {
            const icon = getProductIcon(chip.slug);
            if (!icon) return null;
            return (
              <div key={chip.slug} className={moodStyles.chip}>
                <span
                  className={moodStyles.chipIcon}
                  style={{
                    '--glow-color': chip.glowColor,
                    '--glow-size': `${chip.glowSize}px`,
                    '--glow-blur': `${chip.glowBlur}px`,
                    '--glow-opacity': String(chip.glowOpacity),
                  } as CSSProperties}
                >
                  <span className={moodStyles.chipGlow} aria-hidden="true" />
                  <Image
                    className={moodStyles.chipImage}
                    src={icon.src}
                    alt=""
                    width={icon.width}
                    height={icon.height}
                  />
                </span>
                <span className={moodStyles.chipLabel}>{chip.label}</span>
              </div>
            );
          })}
        </div>

        {moodPills.length > 0 && (
          <nav className={moodStyles.pillsRow} aria-label="Moods" ref={pillsRowRef}>
            {moodPills.map((pill) =>
              pill.slug === moodSlug ? (
                <span
                  key={pill.slug}
                  ref={activePillRef}
                  className={`${moodStyles.pill} ${moodStyles.pillActive}`}
                  aria-current="page"
                >
                  {pill.name}
                </span>
              ) : (
                <Link key={pill.slug} href={`/moods/${pill.slug}`} className={moodStyles.pill}>
                  {pill.name}
                </Link>
              )
            )}
          </nav>
        )}

        {hasHeader && (
          <header className={moodStyles.header}>
            {/* Always h2: the banner slot above provides the page's h1 in both the
                hero and no-hero cases. */}
            {introHeading && <h2 className={moodStyles.sectionTitle}>{introHeading}</h2>}
            {introText && (
              <>
                <div
                  ref={descRef}
                  className={`${moodStyles.sentence} ${!descExpanded ? moodStyles.sentenceClamped : ''}`}
                >
                  {introText}
                </div>
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
            {warningMessage && (
              <p className={styles.warningMessage}>
                <span aria-hidden="true">⚠️</span> {warningMessage}
              </p>
            )}
          </header>
        )}

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
            <div className={`${styles.sidebarWrapper} ${moodStyles.filterSidebar}`}>
              {/* React reuses the component across mood-to-mood navigation, so
                  without the key the accordions opened on one mood stay open
                  on the next. */}
              <FilterPanel
                key={moodSlug}
                filterGroups={filterGroups}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                sortValue={currentSort}
                onSortChange={handleSortChange}
                showSort={false}
                priceRange={priceRange}
                onPriceChange={handlePriceChange}
              />
            </div>

            <main className={styles.main}>
              <div className={styles.controls}>
                <span className={styles.productCount}>
                  {`${displayCount} ${displayCount === 1 ? 'product' : 'products'}`}
                </span>
                <div className={styles.sortWrapperDesktop}>
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

              <FilterSheet
                filterGroups={filterGroups}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                productCount={displayCount}
                sortValue={currentSort}
                onSortChange={handleSortChange}
                priceRange={priceRange}
                onPriceChange={handlePriceChange}
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
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                  disabled={loading}
                  label="Mood pagination"
                />
              )}
            </main>
          </div>
        )}

        <div className={moodStyles.bestsellers}>
          <CollectionSlider collectionSlider={BESTSELLERS_SLIDER} />
        </div>

        {nextMood && (
          <YouMayAlsoLike
            source={{ kind: 'taxonomy', slug: nextMood.slug, taxonomy: 'mood', count: 8 }}
            title={`Explore ${nextMood.name} Products`}
            layout="carousel"
            attribution="next_mood"
            className={moodStyles.nextMood}
          />
        )}

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

        <LoyaltyTiers loyaltyTiers={loyaltyTiers} />

        <BlogPosts blogPosts={BLOG_POSTS} />
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

    const [menuClient, metaRes, facetsRes, productsRes, moodsRes, loyaltyRes] = await Promise.all([
      prefetchMenus(),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-meta?${qs}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-facets?${qs}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${wpUrl}/wp-json/mf/v1/collection-products?${qs}&per_page=${MOOD_PAGE_SIZE}`)
        .then((r) => r.json())
        .catch(() => null),
      getClient()
        .query({ query: GET_ALL_MOODS })
        .catch(() => null),
      getClient()
        .query({ query: GET_LOYALTY_TIERS })
        .catch(() => null),
    ]);

    // `mood`, not `collection`: the endpoint keys the term by its taxonomy
    // (mellow-fellow-collection-meta.php:190). Reading `.collection` here is
    // undefined on every request and 404s all six pages.
    if (!metaRes?.success || !metaRes?.mood) {
      return { notFound: true, revalidate: 60 };
    }

    const raw = metaRes.mood;

    const mood: Mood = {
      ...raw,
      name: decodeEntities(raw.name),
      moodFields: raw.moodFields
        ? {
            ...raw.moodFields,
            introHeading: decodeEntities(raw.moodFields.introHeading),
            introText: decodeEntities(raw.moodFields.introText),
            warningMessage: decodeEntities(raw.moodFields.warningMessage),
            faqSectionTitle: decodeEntities(raw.moodFields.faqSectionTitle),
            faqs: raw.moodFields.faqs
              ? {
                  ...raw.moodFields.faqs,
                  nodes: (raw.moodFields.faqs.nodes ?? []).map(
                    (faq: { id: string; title: string; content: string }) => ({
                      ...faq,
                      title: decodeEntities(faq.title),
                    })
                  ),
                }
              : raw.moodFields.faqs,
          }
        : raw.moodFields,
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
    const initialTotalPages = productsRes?.totalPages || (totalProducts > 0 ? Math.ceil(totalProducts / MOOD_PAGE_SIZE) : 0);

    const moodPills: MoodPill[] = (moodsRes?.data?.moods?.nodes || [])
      .map((m: { name: string; slug: string }) => ({
        name: decodeEntities(m.name),
        slug: m.slug,
      }))
      .sort((a: MoodPill, b: MoodPill) => moodRank(a.slug) - moodRank(b.slug));

    const result = {
      props: {
        mood,
        moodPills,
        initialProducts,
        initialFilterGroups: filterGroupsData,
        totalProducts,
        initialHasNextPage,
        initialTotalPages,
        moodSlug: slug,
        loyaltyTiers: loyaltyRes?.data?.siteSettings?.loyaltyTiers ?? null,
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
