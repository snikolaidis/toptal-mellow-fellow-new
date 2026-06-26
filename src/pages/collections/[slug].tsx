import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import {
  GET_COLLECTION_META,
  GET_COLLECTION_FACET_TERMS,
} from '@/graphql/queries/collections';
import { GET_PRODUCTS } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Collection, Product } from '@/types/woocommerce';
import {
  PAGE_SIZE,
  SORT_OPTIONS,
  FilterGroup,
  ActiveFilters,
  parseFilterParams,
  filtersToGraphQLVars,
  filtersToQueryParams,
  getSortVariables,
  deriveFilterGroups,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/collection.module.css';

const sortOptions: SelectOption[] = SORT_OPTIONS;

interface CollectionsPageProps {
  collection: Collection;
  products: Product[];
  filterGroups: FilterGroup[];
  hasNextPage: boolean;
  endCursor: string | null;
  activeFilters: ActiveFilters;
  selectedSort: string;
}

export default function CollectionsPage({
  collection,
  products: initialProducts,
  filterGroups,
  hasNextPage: initialHasNext,
  endCursor: initialCursor,
  activeFilters: initialFilters,
  selectedSort,
}: CollectionsPageProps) {
  const router = useRouter();
  const [additionalProducts, setAdditionalProducts] = useState<Product[]>([]);
  const [hasNextPage, setHasNextPage] = useState(initialHasNext);
  const [endCursor, setEndCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilters, setActiveFilters] = useState(initialFilters);

  // Sync local state from props when the URL (filters/sort) changes.
  useEffect(() => {
    setActiveFilters(initialFilters);
    setAdditionalProducts([]);
    setHasNextPage(initialHasNext);
    setEndCursor(initialCursor);
  }, [JSON.stringify(initialFilters), selectedSort, initialHasNext, initialCursor]);

  const basePath = `/collections/${collection.slug}`;
  const allProducts = [...initialProducts, ...additionalProducts];
  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  const handleFilterChange = (key: string, slugs: string[]) => {
    const newFilters = { ...activeFilters, [key]: slugs };
    const cleaned: ActiveFilters = {};
    for (const [k, v] of Object.entries(newFilters)) {
      if (v.length > 0) cleaned[k] = v;
    }
    router.push({ pathname: basePath, query: filtersToQueryParams(cleaned, selectedSort) });
  };

  const handleSortChange = (option: SelectOption | null) => {
    if (!option) return;
    router.push({ pathname: basePath, query: filtersToQueryParams(activeFilters, option.value) });
  };

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        after: endCursor,
        first: String(PAGE_SIZE),
        sort: selectedSort,
        collection: collection.slug,
      });
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
  }, [hasNextPage, endCursor, loadingMore, selectedSort, activeFilters, collection.slug]);

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
      <div className={styles.page}>
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.separator}>/</span>
          <Link href="/collections">Collections</Link>
          <span className={styles.separator}>/</span>
          <span className={styles.current}>{collection.name}</span>
        </nav>

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.title}>{collection.name}</h1>
            {collection.description && (
              <div
                className={styles.description}
                dangerouslySetInnerHTML={{ __html: collection.description }}
              />
            )}
          </div>
        </header>

        {/* Layout: sidebar + main */}
        <div className={styles.layout}>
          {/* Desktop Sidebar */}
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
              <span className={styles.productCount}>
                {allProducts.length}{hasNextPage ? '+' : ''}{' '}
                {allProducts.length === 1 ? 'product' : 'products'}
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

            {/* Empty collection (no filters applied) */}
            {initialProducts.length === 0 &&
              Object.keys(activeFilters).length === 0 && (
                <div className={styles.empty}>
                  <p>No products in this collection yet.</p>
                  <Link href="/shop" className="btn-secondary">
                    Browse All Products
                  </Link>
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

export const getServerSideProps: GetServerSideProps = async ({ params, query, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const selectedSort = typeof query.sort === 'string' ? query.sort : 'default';
  const activeFilters = parseFilterParams(query as Record<string, string>);
  const filterVars = filtersToGraphQLVars(activeFilters);
  const sortVars = getSortVariables(selectedSort);

  try {
    const client = getClient();

    const [metaRes, facetRes, productsRes] = await Promise.all([
      client.query({
        query: GET_COLLECTION_META,
        variables: { slug },
        fetchPolicy: 'network-only',
      }),
      client.query({
        query: GET_COLLECTION_FACET_TERMS,
        variables: { terms: [slug] },
        // no-cache: the facet products overlap GET_PRODUCTS' products (same
        // databaseId); normalizing them into the shared cache lets GET_PRODUCTS'
        // name-only taxonomy writes clobber the name+slug we need here.
        fetchPolicy: 'no-cache',
      }),
      client.query({
        query: GET_PRODUCTS,
        variables: { first: PAGE_SIZE, collectionFilterIn: [slug], ...sortVars, ...filterVars },
        fetchPolicy: 'network-only',
      }),
    ]);

    if (!metaRes.data?.collection) {
      return { notFound: true };
    }

    const filterGroups = deriveFilterGroups(facetRes.data?.products?.nodes || []);

    return {
      props: {
        collection: metaRes.data.collection,
        products: productsRes.data?.products?.nodes || [],
        filterGroups,
        hasNextPage: productsRes.data?.products?.pageInfo?.hasNextPage || false,
        endCursor: productsRes.data?.products?.pageInfo?.endCursor || null,
        activeFilters,
        selectedSort,
      },
    };
  } catch (error) {
    console.error('Error fetching collection:', error);
    return { notFound: true };
  }
};
