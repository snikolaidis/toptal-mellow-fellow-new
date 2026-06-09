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
import styles from '@/styles/pages/shop.module.css';

const PAGE_SIZE = 24;

const sortOptions: SelectOption[] = [
  { value: 'default', label: 'Featured' },
  { value: 'newest', label: 'Date, new to old' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
];

// Maps URL param keys to GraphQL variable names
const FILTER_PARAM_MAP: Record<string, string> = {
  productType: 'mfProductTypeIn',
  strainType: 'strainTypeFilterIn',
  blendType: 'blendTypeFilterIn',
  cannabinoid: 'cannabinoidFilterIn',
  singleCannabinoid: 'singleCannabinoidFilterIn',
  size: 'sizeFilterIn',
  mg: 'mgFilterIn',
  pieces: 'piecesFilterIn',
  collection: 'collectionFilterIn',
};

// Filter group definitions: key (URL param), label (display), dataKey (from GraphQL response)
const FILTER_GROUPS = [
  { key: 'productType', label: 'Product Type', dataKey: 'productTypes' },
  { key: 'size', label: 'Size', dataKey: 'sizes' },
  { key: 'strainType', label: 'Strain Type', dataKey: 'strainTypes' },
  { key: 'blendType', label: 'Experience Type', dataKey: 'blendTypes' },
  { key: 'cannabinoid', label: 'Cannabinoid', dataKey: 'cannabinoids' },
  { key: 'singleCannabinoid', label: 'No Blend Single Cannabinoids', dataKey: 'singleCannabinoids' },
  { key: 'mg', label: 'MG', dataKey: 'mgs' },
  { key: 'pieces', label: 'Pieces', dataKey: 'pcs' },
];

interface TaxonomyTerm {
  name: string;
  slug: string;
  count: number;
}

interface ShopPageProps {
  products: Product[];
  filterTerms: Record<string, TaxonomyTerm[]>;
  hasNextPage: boolean;
  endCursor: string | null;
  activeFilters: Record<string, string[]>;
  selectedSort: string;
}

function parseFilterParams(query: Record<string, string | string[] | undefined>): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const key of Object.keys(FILTER_PARAM_MAP)) {
    const val = query[key];
    if (typeof val === 'string' && val) {
      filters[key] = val.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return filters;
}

function filtersToGraphQLVars(filters: Record<string, string[]>): Record<string, string[]> {
  const vars: Record<string, string[]> = {};
  for (const [paramKey, slugs] of Object.entries(filters)) {
    if (slugs.length > 0) {
      const gqlKey = FILTER_PARAM_MAP[paramKey];
      if (gqlKey) vars[gqlKey] = slugs;
    }
  }
  return vars;
}

function filtersToQueryParams(filters: Record<string, string[]>, sort: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, slugs] of Object.entries(filters)) {
    if (slugs.length > 0) query[key] = slugs.join(',');
  }
  if (sort !== 'default') query.sort = sort;
  return query;
}

function getSortVariables(sort: string) {
  switch (sort) {
    case 'newest':
      return { orderby: [{ field: 'DATE', order: 'DESC' }] };
    case 'price-low':
      return { orderby: [{ field: 'PRICE', order: 'ASC' }] };
    case 'price-high':
      return { orderby: [{ field: 'PRICE', order: 'DESC' }] };
    case 'name-asc':
      return { orderby: [{ field: 'NAME', order: 'ASC' }] };
    case 'name-desc':
      return { orderby: [{ field: 'NAME', order: 'DESC' }] };
    default:
      return {};
  }
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
    <Layout title="Shop">
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
            <div className={styles.productsGrid}>
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
