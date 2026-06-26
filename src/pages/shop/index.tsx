import { GetServerSideProps } from 'next';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCTS, GET_SHOP_FILTER_TERMS } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Product } from '@/types/woocommerce';
import {
  PAGE_SIZE,
  FILTER_GROUPS,
  SORT_OPTIONS,
  TaxonomyTerm,
  parseFilterParams,
  filtersToGraphQLVars,
  filtersToQueryParams,
  getSortVariables,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/shop.module.css';

const sortOptions: SelectOption[] = SORT_OPTIONS;

interface ShopPageProps {
  products: Product[];
  filterTerms: Record<string, TaxonomyTerm[]>;
  hasNextPage: boolean;
  endCursor: string | null;
  activeFilters: Record<string, string[]>;
  selectedSort: string;
}

export default function ShopPage({
  products: initialProducts,
  filterTerms,
  hasNextPage: initialHasNext,
  endCursor: initialCursor,
  activeFilters: initialFilters,
  selectedSort,
}: ShopPageProps) {
  const router = useRouter();
  const [additionalProducts, setAdditionalProducts] = useState<Product[]>([]);
  const [hasNextPage, setHasNextPage] = useState(initialHasNext);
  const [endCursor, setEndCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilters, setActiveFilters] = useState(initialFilters);

  // Sync filters from props when URL changes
  useEffect(() => {
    setActiveFilters(initialFilters);
    setAdditionalProducts([]);
    setHasNextPage(initialHasNext);
    setEndCursor(initialCursor);
  }, [JSON.stringify(initialFilters), selectedSort, initialHasNext, initialCursor]);

  const allProducts = [...initialProducts, ...additionalProducts];
  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  const totalActive = Object.values(activeFilters).reduce((sum, v) => sum + v.length, 0);
  const pageTitle = totalActive > 0 ? 'Filtered Products' : 'All Products';

  const handleFilterChange = (key: string, slugs: string[]) => {
    const newFilters = { ...activeFilters, [key]: slugs };
    // Remove empty filters
    const cleaned: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(newFilters)) {
      if (v.length > 0) cleaned[k] = v;
    }
    router.push({ pathname: '/shop', query: filtersToQueryParams(cleaned, selectedSort) });
  };

  const handleSortChange = (option: SelectOption | null) => {
    if (!option) return;
    router.push({ pathname: '/shop', query: filtersToQueryParams(activeFilters, option.value) });
  };

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        after: endCursor,
        first: String(PAGE_SIZE),
        sort: selectedSort,
      });
      // Pass active filters to the load-more API
      for (const [key, slugs] of Object.entries(activeFilters)) {
        if (slugs.length > 0) params.set(key, slugs.join(','));
      }

      const res = await fetch(`/api/shop/products?${params}`);
      const data = await res.json();

      if (data.success) {
        setAdditionalProducts((prev) => [...prev, ...data.products]);
        setHasNextPage(data.hasNextPage);
        setEndCursor(data.endCursor);
      }
    } catch (err) {
      console.error('Failed to load more products');
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, endCursor, loadingMore, selectedSort, activeFilters]);

  // Build filter groups for sidebar
  const filterGroups = FILTER_GROUPS.map((fg) => ({
    key: fg.key,
    label: fg.label,
    terms: filterTerms[fg.dataKey] || [],
  }));

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
          <div className={styles.shopLayout}>
            {/* Desktop Sidebar */}
            <div className={styles.sidebarWrapper}>
              <ShopSidebar
                filterGroups={filterGroups}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
              />
            </div>

            {/* Main Content */}
            <main className={styles.shopMain}>
              {/* Header */}
              <div className={styles.shopHeader}>
                <div className={styles.headerLeft}>
                  <h1 className={styles.title}>{pageTitle}</h1>
                  <span className={styles.productCount}>
                    {allProducts.length}{hasNextPage ? '+' : ''} products
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

              {/* Products Grid */}
              <div className='products-grid'>
                {allProducts.length > 0 ? (
                  allProducts.map((product, index) => (
                    <ProductCard key={product.id} product={product} priority={index < 12} />
                  ))
                ) : (
                  <p className={styles.noProducts}>No products found matching your filters.</p>
                )}
              </div>

              {/* Load More */}
              {hasNextPage && (
                <div className={styles.loadMore}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className={styles.loadMoreBtn}
                  >
                    {loadingMore ? (
                      <>
                        <span className="spinner h-4 w-4" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>

        {/* Mobile Filters */}
        <MobileFilters
          filterGroups={filterGroups}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          productCount={allProducts.length}
        />
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ query, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  const selectedSort = typeof query.sort === 'string' ? query.sort : 'default';
  const activeFilters = parseFilterParams(query as Record<string, string>);
  const filterVars = filtersToGraphQLVars(activeFilters);
  const sortVars = getSortVariables(selectedSort);

  try {
    const client = getClient();

    const [productsRes, filterTermsRes] = await Promise.all([
      client.query({
        query: GET_PRODUCTS,
        variables: { first: PAGE_SIZE, ...sortVars, ...filterVars },
        fetchPolicy: 'network-only',
      }),
      client.query({
        query: GET_SHOP_FILTER_TERMS,
        fetchPolicy: 'network-only',
      }),
    ]);

    const filterTerms: Record<string, TaxonomyTerm[]> = {};
    const termsData = filterTermsRes.data || {};
    for (const key of Object.keys(termsData)) {
      filterTerms[key] = (termsData[key]?.nodes || []).filter((t: TaxonomyTerm) => t.count > 0);
    }

    return {
      props: {
        products: productsRes.data?.products?.nodes || [],
        filterTerms,
        hasNextPage: productsRes.data?.products?.pageInfo?.hasNextPage || false,
        endCursor: productsRes.data?.products?.pageInfo?.endCursor || null,
        activeFilters,
        selectedSort,
      },
    };
  } catch (error) {
    console.error('Error fetching shop data');
    return {
      props: {
        products: [],
        filterTerms: {},
        hasNextPage: false,
        endCursor: null,
        activeFilters,
        selectedSort,
      },
    };
  }
};
