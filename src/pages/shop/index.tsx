import { GetStaticProps } from 'next';
import { useMemo, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCTS, GET_PRODUCT_CATEGORIES } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Product, ProductCategory } from '@/types/woocommerce';
import styles from '@/styles/pages/shop.module.css';

interface ShopPageProps {
  products: Product[];
  categories: ProductCategory[];
}

const sortOptions: SelectOption[] = [
  { value: 'default', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'name', label: 'Name: A to Z' },
];

export default function ShopPage({ products, categories }: ShopPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SelectOption>(sortOptions[0]);

  // Parse price string to number (handles "$29.00", "29.00", "$20.00 - $30.00")
  const parsePrice = (priceStr: string | undefined): number => {
    if (!priceStr) return 0;
    // For price ranges like "$20.00 - $30.00", take the first price
    const firstPrice = priceStr.split('-')[0];
    // Remove all non-numeric characters except decimal point
    const numericStr = firstPrice.replace(/[^0-9.]/g, '');
    return parseFloat(numericStr) || 0;
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (selectedCategory === 'all') return true;
      return product.productCategories?.nodes?.some(
        (cat) => cat.slug === selectedCategory
      );
    });
  }, [products, selectedCategory]);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      switch (sortBy.value) {
        case 'price-low':
          return parsePrice(a.price) - parsePrice(b.price);
        case 'price-high':
          return parsePrice(b.price) - parsePrice(a.price);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'newest':
          return 0;
        default:
          return 0;
      }
    });
  }, [filteredProducts, sortBy]);

  const selectedCategoryName = useMemo(() => {
    if (selectedCategory === 'all') return 'All Products';
    const category = categories.find((c) => c.slug === selectedCategory);
    return category?.name || 'Products';
  }, [selectedCategory, categories]);

  // Calculate actual category counts from loaded products
  const categoryCounts = useMemo(() => {
    const counts: { [slug: string]: number } = {};
    products.forEach((product) => {
      product.productCategories?.nodes?.forEach((cat) => {
        counts[cat.slug] = (counts[cat.slug] || 0) + 1;
      });
    });
    return counts;
  }, [products]);

  return (
    <Layout title="Shop">
      <div className={styles.page}>
        <div className={styles.shopLayout}>
          {/* Desktop Sidebar */}
          <div className={styles.sidebarWrapper}>
            <ShopSidebar
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              productCount={products.length}
              categoryCounts={categoryCounts}
            />
          </div>

          {/* Main Content */}
          <main className={styles.shopMain}>
            {/* Header */}
            <div className={styles.shopHeader}>
              <div className={styles.headerLeft}>
                <h1 className={styles.title}>{selectedCategoryName}</h1>
                <span className={styles.productCount}>
                  {sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'products'}
                </span>
              </div>

              <div className={styles.headerRight}>
                <label className={styles.sortLabel}>Sort by</label>
                <div className={styles.sortSelect}>
                  <Select
                    value={sortBy}
                    onChange={(option) => option && setSortBy(option)}
                    options={sortOptions}
                    instanceId="sort-select"
                  />
                </div>
              </div>
            </div>

            {/* Products Grid */}
            <div className={styles.productsGrid}>
              {sortedProducts.length > 0 ? (
                sortedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))
              ) : (
                <p className={styles.noProducts}>No products found in this category.</p>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Filters - Bottom Sheet */}
      <MobileFilters
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        productCount={products.length}
        categoryCounts={categoryCounts}
        filteredCount={sortedProducts.length}
      />
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  try {
    const client = getClient();

    const [productsRes, categoriesRes] = await Promise.all([
      client.query({
        query: GET_PRODUCTS,
        variables: { first: 100 },
      }),
      client.query({
        query: GET_PRODUCT_CATEGORIES,
      }),
    ]);

    return {
      props: {
        products: productsRes.data?.products?.nodes || [],
        categories: categoriesRes.data?.productCategories?.nodes || [],
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching shop data:', error);
    return {
      props: {
        products: [],
        categories: [],
      },
      revalidate: 60,
    };
  }
};
