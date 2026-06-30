import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Product } from '@/types/woocommerce';
import { GET_PRODUCTS } from '@/graphql/queries/products';
import {
  PAGE_SIZE,
  FILTER_GROUPS,
  SORT_OPTIONS,
  FilterGroup,
  TaxonomyTerm,
  ActiveFilters,
  parseFilterParams,
  filtersToGraphQLVars,
  getSortVariables,
  deriveFilterGroups,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/search.module.css';

const sortOptions: SelectOption[] = SORT_OPTIONS;

// Facet-only query: fetches up to 200 search results with just taxonomy data
// so we can derive search-scoped filter terms (not the whole catalog).
const SEARCH_FACET_TERMS = gql`
  query SearchFacetTerms($search: String!) {
    products(first: 200, where: { search: $search, status: "publish" }) {
      nodes {
        __typename
        ... on SimpleProduct { id databaseId mfproductTypes { nodes { name slug } } size { nodes { name slug } } strainTypes { nodes { name slug } } blendTypes { nodes { name slug } } cannabinoids { nodes { name slug } } singleCannabinoid { nodes { name slug } } mG { nodes { name slug } } pieces { nodes { name slug } } }
        ... on VariableProduct { id databaseId mfproductTypes { nodes { name slug } } size { nodes { name slug } } strainTypes { nodes { name slug } } blendTypes { nodes { name slug } } cannabinoids { nodes { name slug } } singleCannabinoid { nodes { name slug } } mG { nodes { name slug } } pieces { nodes { name slug } } }
      }
    }
  }
`;

/** Boost products whose name contains all search terms to the top */
function boostTitleMatches(products: Product[], query: string): Product[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return products;

  return [...products].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aMatch = terms.every((t) => aName.includes(t));
    const bMatch = terms.every((t) => bName.includes(t));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });
}

interface SearchPageProps {
  query: string;
  products: Product[];
  filterGroups: FilterGroup[];
  hasNextPage: boolean;
  endCursor: string | null;
  activeFilters: ActiveFilters;
  selectedSort: string;
}

export default function SearchPage({
  query,
  products: initialProducts,
  filterGroups,
  hasNextPage: initialHasNext,
  endCursor: initialCursor,
  activeFilters: initialFilters,
  selectedSort,
}: SearchPageProps) {
  const router = useRouter();
  const [additionalProducts, setAdditionalProducts] = useState<Product[]>([]);
  const [hasNextPage, setHasNextPage] = useState(initialHasNext);
  const [endCursor, setEndCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilters, setActiveFilters] = useState(initialFilters);

  useEffect(() => {
    setActiveFilters(initialFilters);
    setAdditionalProducts([]);
    setHasNextPage(initialHasNext);
    setEndCursor(initialCursor);
  }, [JSON.stringify(initialFilters), selectedSort, initialHasNext, initialCursor]);

  const allProducts = [...initialProducts, ...additionalProducts];
  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  const buildQuery = (filters: ActiveFilters, sort: string) => {
    const q: Record<string, string> = { q: query };
    for (const [key, slugs] of Object.entries(filters)) {
      if (slugs.length > 0) q[key] = slugs.join(',');
    }
    if (sort !== 'default') q.sort = sort;
    return q;
  };

  const handleFilterChange = (key: string, slugs: string[]) => {
    const newFilters = { ...activeFilters, [key]: slugs };
    const cleaned: ActiveFilters = {};
    for (const [k, v] of Object.entries(newFilters)) {
      if (v.length > 0) cleaned[k] = v;
    }
    router.push({ pathname: '/search', query: buildQuery(cleaned, selectedSort) });
  };

  const handleSortChange = (option: SelectOption | null) => {
    if (!option) return;
    router.push({ pathname: '/search', query: buildQuery(activeFilters, option.value) });
  };

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        q: query,
        after: endCursor,
        first: String(PAGE_SIZE),
        sort: selectedSort,
      });
      for (const [key, slugs] of Object.entries(activeFilters)) {
        if (slugs.length > 0) params.set(key, slugs.join(','));
      }

      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();

      if (data.success && data.products) {
        setAdditionalProducts((prev) => [...prev, ...data.products]);
        setHasNextPage(data.hasNextPage ?? false);
        setEndCursor(data.endCursor ?? null);
      }
    } catch {
      console.error('Failed to load more search results');
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, endCursor, loadingMore, query, selectedSort, activeFilters]);

  return (
    <Layout
      title={query ? `Search: ${query}` : 'Search'}
      description={`Search results for "${query}"`}
    >
      <div className={styles.page}>
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.separator}>/</span>
          <span className={styles.current}>Search</span>
        </nav>

        {/* Header */}
        <header className={styles.header}>
          <h1 className={styles.title}>
            {query ? (
              <>Search results for &ldquo;{query}&rdquo;</>
            ) : (
              'Search'
            )}
          </h1>
        </header>

        {/* Layout: sidebar + main */}
        <div className={styles.layout}>
          <div className={styles.sidebarWrapper}>
            <ShopSidebar
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
            />
          </div>

          <main className={styles.main}>
            {/* Controls */}
            <div className={styles.controls}>
              <span className={styles.count}>
                {allProducts.length}{hasNextPage ? '+' : ''}{' '}
                {allProducts.length === 1 ? 'result' : 'results'}
              </span>
              <div className={styles.sortWrapper}>
                <span className={styles.sortLabel}>Sort by</span>
                <div className={styles.sortSelect}>
                  <Select
                    options={sortOptions}
                    value={currentSort}
                    onChange={handleSortChange}
                    instanceId="search-sort-select"
                  />
                </div>
              </div>
            </div>

            {/* Results Grid */}
            {allProducts.length > 0 ? (
              <div className="products-grid">
                {allProducts.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 12} />
                ))}
              </div>
            ) : query ? (
              <div className={styles.empty}>
                <h2>No results found</h2>
                <p>Try adjusting your search or filters.</p>
                <Link href="/shop" className="btn-primary">
                  Browse All Products
                </Link>
              </div>
            ) : null}

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

export const getServerSideProps: GetServerSideProps = async ({ query: params, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const selectedSort = typeof params.sort === 'string' ? params.sort : 'default';
  const activeFilters = parseFilterParams(params as Record<string, string>);
  const filterVars = filtersToGraphQLVars(activeFilters);
  const sortVars = getSortVariables(selectedSort);

  if (!query) {
    return {
      props: {
        query: '',
        products: [],
        filterGroups: [],
        hasNextPage: false,
        endCursor: null,
        activeFilters: {},
        selectedSort: 'default',
      },
    };
  }

  try {
    const client = getClient();

    const [searchRes, facetRes] = await Promise.all([
      client.query({
        query: GET_PRODUCTS,
        variables: { first: PAGE_SIZE, search: query, ...sortVars, ...filterVars },
        fetchPolicy: 'network-only',
      }),
      client.query({
        query: SEARCH_FACET_TERMS,
        variables: { search: query },
        fetchPolicy: 'no-cache',
      }),
    ]);

    // Derive filter groups scoped to this search's results
    const facetNodes = facetRes.data?.products?.nodes || [];
    const filterGroups = deriveFilterGroups(facetNodes);

    // Boost title matches when using default sort
    let products = searchRes.data?.products?.nodes || [];
    if (selectedSort === 'default') {
      products = boostTitleMatches(products, query);
    }

    return {
      props: {
        query,
        products,
        filterGroups,
        hasNextPage: searchRes.data?.products?.pageInfo?.hasNextPage || false,
        endCursor: searchRes.data?.products?.pageInfo?.endCursor || null,
        activeFilters,
        selectedSort,
      },
    };
  } catch (error) {
    console.error('[Search Page] Query failed:', error);
    return {
      props: {
        query,
        products: [],
        filterGroups: [],
        hasNextPage: false,
        endCursor: null,
        activeFilters: {},
        selectedSort: 'default',
      },
    };
  }
};
