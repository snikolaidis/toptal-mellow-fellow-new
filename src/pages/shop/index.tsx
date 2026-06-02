import { GetServerSideProps } from 'next';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import { GET_PRODUCTS, GET_PRODUCTS_BY_CATEGORY, GET_PRODUCT_CATEGORIES } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Product, ProductCategory } from '@/types/woocommerce';
import styles from '@/styles/pages/shop.module.css';

const PAGE_SIZE = 24;

const sortOptions: SelectOption[] = [
  { value: 'default', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
];

interface ShopPageProps {
  products: Product[];
  categories: ProductCategory[];
  hasNextPage: boolean;
  endCursor: string | null;
  selectedCategory: string;
  selectedSort: string;
  totalPublished: number;
}

export default function ShopPage({
  products: initialProducts,
  categories,
  hasNextPage: initialHasNext,
  endCursor: initialCursor,
  selectedCategory,
  selectedSort,
  totalPublished,
}: ShopPageProps) {
  const router = useRouter();
  const [additionalProducts, setAdditionalProducts] = useState<Product[]>([]);
  const [hasNextPage, setHasNextPage] = useState(initialHasNext);
  const [endCursor, setEndCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reset load-more state when filters/sort change
  useEffect(() => {
    setAdditionalProducts([]);
    setHasNextPage(initialHasNext);
    setEndCursor(initialCursor);
  }, [selectedCategory, selectedSort, initialHasNext, initialCursor]);

  const allProducts = [...initialProducts, ...additionalProducts];
  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  const selectedCategoryName =
    selectedCategory === 'all'
      ? 'All Products'
      : categories.find((c) => c.slug === selectedCategory)?.name || 'Products';

  // For "All Products" show total published; for a category use WooCommerce's count
  const displayCount = selectedCategory !== 'all'
    ? categories.find((c) => c.slug === selectedCategory)?.count || allProducts.length
    : totalPublished;

  const handleCategoryChange = (slug: string) => {
    const query: Record<string, string> = {};
    if (slug !== 'all') query.category = slug;
    if (selectedSort !== 'default') query.sort = selectedSort;
    router.push({ pathname: '/shop', query });
  };

  const handleSortChange = (option: SelectOption | null) => {
    if (!option) return;
    const query: Record<string, string> = {};
    if (selectedCategory !== 'all') query.category = selectedCategory;
    if (option.value !== 'default') query.sort = option.value;
    router.push({ pathname: '/shop', query });
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
      if (selectedCategory !== 'all') params.set('category', selectedCategory);

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
  }, [hasNextPage, endCursor, loadingMore, selectedCategory, selectedSort]);

  return (
    <Layout title="Shop">
      <div className={styles.page}>
        <div className={styles.shopLayout}>
          {/* Desktop Sidebar */}
          <div className={styles.sidebarWrapper}>
            <ShopSidebar
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
              productCount={totalPublished}
            />
          </div>

          {/* Main Content */}
          <main className={styles.shopMain}>
            {/* Header */}
            <div className={styles.shopHeader}>
              <div className={styles.headerLeft}>
                <h1 className={styles.title}>{selectedCategoryName}</h1>
                <span className={styles.productCount}>
                  {displayCount} {displayCount === 1 ? 'product' : 'products'}
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
                allProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))
              ) : (
                <p className={styles.noProducts}>No products found in this category.</p>
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

      {/* Mobile Filters - Bottom Sheet */}
      <MobileFilters
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        productCount={totalPublished}
        filteredCount={allProducts.length}
      />
    </Layout>
  );
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

/**
 * Count total published products by paginating through IDs only.
 * WPGraphQL caps `first` at 100, so we loop until hasNextPage is false.
 */
const COUNT_PRODUCTS = gql`
  query CountProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, where: { status: "publish" }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on SimpleProduct { databaseId }
        ... on VariableProduct { databaseId }
        ... on ExternalProduct { databaseId }
        ... on GroupProduct { databaseId }
      }
    }
  }
`;

async function getTotalPublishedCount(client: ReturnType<typeof getClient>): Promise<number> {
  let total = 0;
  let after: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const result: any = await client.query({
      query: COUNT_PRODUCTS,
      variables: { first: 100, after },
      fetchPolicy: 'network-only',
    });

    total += result.data?.products?.nodes?.length || 0;
    hasNext = result.data?.products?.pageInfo?.hasNextPage || false;
    after = result.data?.products?.pageInfo?.endCursor || null;
  }

  return total;
}

export const getServerSideProps: GetServerSideProps = async ({ query, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  const selectedCategory = (typeof query.category === 'string' ? query.category : 'all');
  const selectedSort = (typeof query.sort === 'string' ? query.sort : 'default');

  try {
    const client = getClient();
    const sortVars = getSortVariables(selectedSort);

    const productQuery = selectedCategory !== 'all'
      ? client.query({
          query: GET_PRODUCTS_BY_CATEGORY,
          variables: { categorySlug: selectedCategory, first: PAGE_SIZE, ...sortVars },
          fetchPolicy: 'network-only',
        })
      : client.query({
          query: GET_PRODUCTS,
          variables: { first: PAGE_SIZE, ...sortVars },
          fetchPolicy: 'network-only',
        });

    const [productsRes, categoriesRes, totalPublished] = await Promise.all([
      productQuery,
      client.query({ query: GET_PRODUCT_CATEGORIES, fetchPolicy: 'network-only' }),
      getTotalPublishedCount(client),
    ]);

    const productNodes = productsRes.data?.products?.nodes || [];
    const pageInfo = productsRes.data?.products?.pageInfo || {};
    const categoryNodes = categoriesRes.data?.productCategories?.nodes || [];

    return {
      props: {
        products: productNodes,
        categories: categoryNodes,
        hasNextPage: pageInfo.hasNextPage || false,
        endCursor: pageInfo.endCursor || null,
        selectedCategory,
        selectedSort,
        totalPublished,
      },
    };
  } catch (error) {
    console.error('Error fetching shop data');
    return {
      props: {
        products: [],
        categories: [],
        hasNextPage: false,
        endCursor: null,
        selectedCategory,
        selectedSort,
        totalPublished: 0,
      },
    };
  }
};
