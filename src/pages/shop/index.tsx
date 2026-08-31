import { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import FilterPanel from '@/components/shop/filters/FilterPanel';
import FilterSheet from '@/components/shop/filters/FilterSheet';
import Select, { SelectOption } from '@/components/ui/Select';
import Link from 'next/link';
import { Product } from '@/types/woocommerce';
import {
  SORT_OPTIONS,
  FilterGroup,
  ActiveFilters,
  buildFacetGroups,
  parseFilterParams,
  filtersToQueryParams,
} from '@/lib/shopFilters';
import { getAllProducts as getAllProductsFromDb } from '@/lib/product-queries';
import styles from '@/styles/pages/shop.module.css';
import gridStyles from '@/styles/shared/product-grid.module.css';

const sortOptions: SelectOption[] = SORT_OPTIONS;
const PAGE_SIZE = 24;

// Minimal query: card display fields only. NO taxonomy connections — those
// come from the taxonomy-map REST API (single SQL, 0.6s for 544 products).
const GET_ALL_SHOP_PRODUCTS = gql`
  query GetAllShopProducts($first: Int = 200, $after: String) {
    products(first: $first, after: $after, where: { status: "publish" }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on SimpleProduct {
          id databaseId name slug
          price regularPrice salePrice stockStatus
          image { sourceUrl altText }
        }
        ... on VariableProduct {
          id databaseId name slug
          price regularPrice salePrice stockStatus
          image { sourceUrl altText }
        }
      }
    }
  }
`;

function parsePrice(price?: string): number {
  if (!price) return 0;
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

function sortProducts(products: Product[], sort: string, bestSellerIds?: Set<number>): Product[] {
  const sorted = [...products];
  switch (sort) {
    case 'best-sellers':
      if (bestSellerIds && bestSellerIds.size > 0) {
        return sorted.sort((a, b) => {
          const aIs = bestSellerIds.has(a.databaseId) ? 0 : 1;
          const bIs = bestSellerIds.has(b.databaseId) ? 0 : 1;
          return aIs - bIs;
        });
      }
      return sorted;
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

interface TaxonomyMap {
  terms: Record<string, Array<{ name: string; slug: string; count: number; productIds: number[] }>>;
  productIndex: Record<number, Record<string, string[]>>;
}

const TAXONOMY_FIELDS: Record<string, string> = {
  productType: 'mfproductTypes',
  size: 'size',
  strainType: 'strainTypes',
  blendType: 'blendTypes',
  cannabinoid: 'cannabinoids',
  singleCannabinoid: 'singleCannabinoid',
  mg: 'mG',
  pieces: 'pieces',
};

/** Build a TaxonomyMap from product raw data (for Postgres path). */
function buildTaxMapFromProducts(products: Product[]): TaxonomyMap {
  const terms: TaxonomyMap['terms'] = {};
  const productIndex: TaxonomyMap['productIndex'] = {};

  for (const product of products) {
    const p = product as any;
    const pid = p.databaseId;
    if (!productIndex[pid]) productIndex[pid] = {};

    for (const [filterKey, fieldName] of Object.entries(TAXONOMY_FIELDS)) {
      const nodes = p?.[fieldName]?.nodes || [];
      if (!terms[filterKey]) terms[filterKey] = [];

      for (const term of nodes) {
        if (!term?.slug) continue;

        // Product index
        if (!productIndex[pid][filterKey]) productIndex[pid][filterKey] = [];
        if (!productIndex[pid][filterKey].includes(term.slug)) {
          productIndex[pid][filterKey].push(term.slug);
        }

        // Terms list
        const existing = terms[filterKey].find((t) => t.slug === term.slug);
        if (existing) {
          existing.count++;
          if (!existing.productIds.includes(pid)) existing.productIds.push(pid);
        } else {
          terms[filterKey].push({ name: term.name, slug: term.slug, count: 1, productIds: [pid] });
        }
      }
    }
  }

  return { terms, productIndex };
}

interface ShopPageProps {
  allProducts: Product[];
  taxMap: TaxonomyMap | null;
  bestSellerIds: number[];
}

export default function ShopPage({ allProducts, taxMap, bestSellerIds }: ShopPageProps) {
  const router = useRouter();
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [selectedSort, setSelectedSort] = useState('default');
  const [page, setPage] = useState(1);

  // Applied here, not seeded into useState like search does. This is
  // getStaticProps, so the prerendered HTML cannot know the query string and
  // seeding from window.location would be a hydration mismatch. router.query is
  // empty until isReady on a static page, hence the guard.
  useEffect(() => {
    if (!router.isReady) return;
    const urlFilters = parseFilterParams(router.query as Record<string, string | string[] | undefined>);
    const urlSort = typeof router.query.sort === 'string' ? router.query.sort : 'default';
    if (Object.keys(urlFilters).length > 0) setActiveFilters(urlFilters);
    if (urlSort !== 'default') setSelectedSort(urlSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const syncUrl = useCallback(
    (filters: ActiveFilters, sort: string) => {
      router.push(
        { pathname: '/shop', query: filtersToQueryParams(filters, sort) },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  // popstate fires on back and forward only, never on our own router.push.
  useEffect(() => {
    const onPopState = () => {
      const params = Object.fromEntries(new URLSearchParams(window.location.search));
      setActiveFilters(parseFilterParams(params));
      setSelectedSort(typeof params.sort === 'string' && params.sort ? params.sort : 'default');
      setPage(1);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const bestSellerSet = useMemo(() => new Set(bestSellerIds), [bestSellerIds]);

  // Enrich products with taxonomy names from the map (for ProductCard display)
  const enrichedProducts = useMemo(() => {
    if (!taxMap) return allProducts;
    return allProducts.map((p) => {
      const idx = taxMap.productIndex[p.databaseId];
      if (!idx) return p;
      const enriched = { ...p } as any;
      // Map filterKey → product field name that ProductCard reads
      const fieldMap: Record<string, string> = {
        productType: 'mfproductTypes',
        size: 'size',
        strainType: 'strainTypes',
        blendType: 'blendTypes',
      };
      for (const [filterKey, fieldName] of Object.entries(fieldMap)) {
        const slugs = idx[filterKey];
        if (slugs?.length) {
          // Find the term name from the terms data
          const termData = taxMap.terms[filterKey] || [];
          enriched[fieldName] = {
            nodes: slugs.map((slug: string) => {
              const term = termData.find((t: any) => t.slug === slug);
              return { name: term?.name || slug };
            }),
          };
        }
      }
      return enriched as Product;
    });
  }, [allProducts, taxMap]);

  // Filter products using the taxonomy index — O(P) per filter change
  const filteredProducts = useMemo(() => {
    let result = enrichedProducts;

    if (taxMap && Object.keys(activeFilters).length > 0) {
      result = result.filter((p) => {
        const idx = taxMap.productIndex[p.databaseId];
        if (!idx) return false;
        for (const [key, slugs] of Object.entries(activeFilters)) {
          if (slugs.length === 0) continue;
          const productSlugs = idx[key] || [];
          if (!slugs.some((s) => productSlugs.includes(s))) return false;
        }
        return true;
      });
    }

    return sortProducts(result, selectedSort, bestSellerSet);
  }, [enrichedProducts, activeFilters, selectedSort, taxMap, bestSellerSet]);

  const filterGroups: FilterGroup[] = useMemo(() => {
    if (!taxMap) return [];
    return buildFacetGroups(
      enrichedProducts,
      activeFilters,
      (product, facetKey) => taxMap.productIndex[product.databaseId]?.[facetKey] || [],
      (facetKey) => taxMap.terms[facetKey] || [],
    );
  }, [taxMap, activeFilters, enrichedProducts]);

  const startIdx = (page - 1) * PAGE_SIZE;
  const pageProducts = filteredProducts.slice(startIdx, startIdx + PAGE_SIZE);
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const hasMore = page < totalPages;
  const hasPrev = page > 1;
  const totalActive = Object.values(activeFilters).reduce((sum, v) => sum + v.length, 0);
  const pageTitle = totalActive > 0 ? 'Filtered Products' : 'All Products';
  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = useCallback(
    (key: string, slugs: string[]) => {
      setActiveFilters((prev) => {
        const next = { ...prev, [key]: slugs };
        for (const k of Object.keys(next)) {
          if (next[k].length === 0) delete next[k];
        }
        syncUrl(next, selectedSort);
        return next;
      });
      setPage(1);
    },
    [syncUrl, selectedSort]
  );

  const handleSortChange = useCallback(
    (option: SelectOption | null) => {
      if (option) {
        setSelectedSort(option.value);
        setPage(1);
        syncUrl(activeFilters, option.value);
      }
    },
    [syncUrl, activeFilters]
  );

  const goToPage = (p: number) => {
    setPage(p);
    scrollToTop();
  };

  return (
    <Layout
      title="Shop"
      description="Browse all Mellow Fellow cannabis products. Filter by product type, strain, cannabinoid, and more."
      seo={{
        title: 'Shop All Products | Mellow Fellow',
        metaDesc: 'Browse all Mellow Fellow cannabis products. Filter by product type, strain, cannabinoid, and more.',
        schema: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Shop All Products',
          description: 'Browse all Mellow Fellow cannabis products.',
          url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/shop`,
          isPartOf: {
            '@type': 'WebSite',
            '@id': `${process.env.NEXT_PUBLIC_SITE_URL || ''}/#website`,
          },
        }),
      }}
    >
      <div className='container'>
        <div className={styles.page}>
          <nav className={styles.breadcrumb}>
            <Link href="/">Home</Link>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span className={styles.breadcrumbCurrent}>Shop</span>
          </nav>

          <div className={styles.shopLayout}>
            <div className={`${styles.sidebarWrapper} ${styles.filterCard}`}>
              <FilterPanel
                filterGroups={filterGroups}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                sortValue={currentSort}
                onSortChange={handleSortChange}
                showSort={false}
              />
            </div>

            <main className={styles.shopMain}>
              <div className={styles.shopHeader}>
                <div className={styles.headerLeft}>
                  <h1 className={styles.title}>{pageTitle}</h1>
                  <span className={styles.productCount}>
                    {filteredProducts.length} products
                  </span>
                </div>
                <div className={styles.headerRight}>
                  <label className={styles.sortLabel}>Sort by</label>
                  <div className={styles.sortSelect}>
                    <Select
                      value={currentSort}
                      onChange={handleSortChange}
                      options={sortOptions}
                      instanceId="sort-select"
                    />
                  </div>
                </div>
              </div>

              <FilterSheet
                filterGroups={filterGroups}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                productCount={filteredProducts.length}
                sortValue={currentSort}
                onSortChange={handleSortChange}
              />

              <div className={gridStyles.productGrid}>
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
            </main>
          </div>
        </div>

      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  try {
    const menuClientPromise = prefetchMenus();
    const baseUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const bestSellerIdsPromise = fetch(`${baseUrl}/wp-json/mf/v1/collection-products?slug=best-sellers&per_page=100`)
      .then((r) => r.json())
      .then((d) => (d.products || []).map((p: any) => p.databaseId as number))
      .catch(() => [] as number[]);
    // Try Postgres first (fast, <20ms for all products)
    const pgProducts = await getAllProductsFromDb();

    if (pgProducts && pgProducts.length > 0) {
      console.log(`[Shop] Loaded ${pgProducts.length} products from Postgres`);

      // Build taxonomy map from the products' raw data
      const taxMap = buildTaxMapFromProducts(pgProducts);
      const bestSellerIds = await bestSellerIdsPromise;

      const menuClient = await menuClientPromise;
      const result = {
        props: { allProducts: pgProducts, taxMap, bestSellerIds } as Record<string, any>,
        revalidate: 120,
      };
      mergeMenuState(result.props, menuClient);
      return result;
    }

    // Fallback: GraphQL batched fetch (slow, may 504)
    console.log('[Shop] Postgres unavailable, falling back to GraphQL');
    const client = getClient();
    let allProducts: Product[] = [];
    let after: string | null = null;
    let hasMore = true;

    while (hasMore) {
      try {
        const { data }: { data: any } = await client.query({
          query: GET_ALL_SHOP_PRODUCTS,
          variables: { first: 100, ...(after ? { after } : {}) },
          fetchPolicy: 'no-cache',
        });

        const nodes = data?.products?.nodes || [];
        allProducts = [...allProducts, ...nodes];
        after = data?.products?.pageInfo?.endCursor || null;
        hasMore = data?.products?.pageInfo?.hasNextPage || false;
      } catch {
        console.error(`[Shop] GraphQL batch failed, using ${allProducts.length} products`);
        hasMore = false;
      }

      // Delay between batches
      if (hasMore) await new Promise((r) => setTimeout(r, 1500));
    }

    // Fetch taxonomy map from WP REST
    const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    let taxMap: TaxonomyMap | null = null;
    try {
      const taxRes = await fetch(`${wpUrl}/wp-json/mf/v1/taxonomy-map`);
      const taxData = await taxRes.json();
      if (taxData.success) taxMap = taxData;
    } catch {
      console.error('Failed to fetch taxonomy map');
    }

    const bestSellerIds = await bestSellerIdsPromise;
    const menuClient = await menuClientPromise;
    const result = {
      props: { allProducts, taxMap, bestSellerIds } as Record<string, any>,
      revalidate: 120,
    };
    mergeMenuState(result.props, menuClient);
    return result;
  } catch (error) {
    console.error('Error fetching shop data:', error);
    return {
      props: { allProducts: [], taxMap: null, bestSellerIds: [] },
      revalidate: 60,
    };
  }
};
