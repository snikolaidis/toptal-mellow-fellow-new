import { GetStaticProps } from 'next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import Link from 'next/link';
import { Product } from '@/types/woocommerce';
import {
  SORT_OPTIONS,
  FILTER_GROUPS,
  FilterGroup,
  ActiveFilters,
  isHiddenTerm,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/shop.module.css';

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

function sortProducts(products: Product[], sort: string): Product[] {
  const sorted = [...products];
  switch (sort) {
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

interface ShopPageProps {
  allProducts: Product[];
  taxMap: TaxonomyMap | null;
}

export default function ShopPage({ allProducts, taxMap }: ShopPageProps) {
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [selectedSort, setSelectedSort] = useState('default');
  const [page, setPage] = useState(1);

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

    return sortProducts(result, selectedSort);
  }, [enrichedProducts, activeFilters, selectedSort, taxMap]);

  // Derive filter groups — when filters active, narrow to filtered results
  const filterGroups: FilterGroup[] = useMemo(() => {
    if (!taxMap) return [];

    return FILTER_GROUPS.map((fg) => {
      const termsData = (taxMap.terms[fg.key] || []).filter((t) => !isHiddenTerm(fg.key, t));
      const hasActiveFilters = Object.keys(activeFilters).length > 0;

      if (!hasActiveFilters) {
        // No filters: show all terms with global counts
        return {
          key: fg.key,
          label: fg.label,
          terms: termsData.map((t) => ({ name: t.name, slug: t.slug, count: t.count })),
        };
      }

      // Filters active: only show terms that appear in filtered results
      const filteredIds = new Set(filteredProducts.map((p) => p.databaseId));
      return {
        key: fg.key,
        label: fg.label,
        terms: termsData
          .map((t) => {
            const matchCount = t.productIds.filter((id) => filteredIds.has(id)).length;
            return { name: t.name, slug: t.slug, count: matchCount };
          })
          .filter((t) => t.count > 0),
      };
    });
  }, [taxMap, activeFilters, filteredProducts]);

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

  const handleFilterChange = useCallback((key: string, slugs: string[]) => {
    setActiveFilters((prev) => {
      const next = { ...prev, [key]: slugs };
      for (const k of Object.keys(next)) {
        if (next[k].length === 0) delete next[k];
      }
      return next;
    });
    setPage(1);
  }, []);

  const handleSortChange = useCallback((option: SelectOption | null) => {
    if (option) {
      setSelectedSort(option.value);
      setPage(1);
    }
  }, []);

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
            <div className={styles.sidebarWrapper}>
              <ShopSidebar
                filterGroups={filterGroups}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
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

              <div className='products-grid'>
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

        <MobileFilters
          filterGroups={filterGroups}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          productCount={filteredProducts.length}
        />
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  try {
    const client = getClient();

    // Fetch in batches of 200 to stay within PHP memory limits.
    // Each batch runs sequentially using cursor pagination.
    let allProducts: Product[] = [];
    let after: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const { data }: { data: any } = await client.query({
        query: GET_ALL_SHOP_PRODUCTS,
        variables: { first: 200, ...(after ? { after } : {}) },
        fetchPolicy: 'no-cache',
      });

      const nodes = data?.products?.nodes || [];
      allProducts = [...allProducts, ...nodes];
      after = data?.products?.pageInfo?.endCursor || null;
      hasMore = data?.products?.pageInfo?.hasNextPage || false;
    }

    // Fetch taxonomy map from the WP REST endpoint (single SQL, ~0.6s)
    const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    let taxMap: TaxonomyMap | null = null;
    try {
      const taxRes = await fetch(`${wpUrl}/wp-json/mf/v1/taxonomy-map`);
      const taxData = await taxRes.json();
      if (taxData.success) taxMap = taxData;
    } catch {
      console.error('Failed to fetch taxonomy map');
    }

    return {
      props: { allProducts, taxMap },
      revalidate: 120,
    };
  } catch (error) {
    console.error('Error fetching shop data:', error);
    return {
      props: { allProducts: [], taxMap: null },
      revalidate: 60,
    };
  }
};
