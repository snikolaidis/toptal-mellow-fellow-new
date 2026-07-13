import { GetServerSideProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Product } from '@/types/woocommerce';
import { GET_PRODUCTS } from '@/graphql/queries/products';
import { cachedQuery } from '@/lib/cache';
import { boostTitleMatches, SEARCH_RANK_WINDOW } from '@/lib/searchRanking';
import {
  SORT_OPTIONS,
  FACET_PRODUCT_CONNECTION,
  FILTER_GROUPS,
  FilterGroup,
  ActiveFilters,
  deriveFilterGroups,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/search.module.css';

const sortOptions: SelectOption[] = SORT_OPTIONS;
const PAGE_SIZE = 24;

const SEARCH_BLOG_POSTS = gql`
  query SearchBlogPosts($search: String!) {
    posts(first: 6, where: { search: $search }) {
      nodes {
        id title slug excerpt date
        featuredImage { node { sourceUrl altText } }
      }
    }
  }
`;

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  featuredImage?: { node: { sourceUrl: string; altText: string } } | null;
}

function parsePrice(price?: string): number {
  if (!price) return 0;
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

/** Check if a product matches active filters */
function productMatchesFilters(product: Product, filters: ActiveFilters): boolean {
  for (const [key, slugs] of Object.entries(filters)) {
    if (slugs.length === 0) continue;
    const connection = FACET_PRODUCT_CONNECTION[key];
    if (!connection) continue;
    const productTerms: Array<{ slug?: string }> = (product as any)?.[connection]?.nodes || [];
    const productSlugs = productTerms.map((t) => t.slug).filter(Boolean);
    if (!slugs.some((s) => productSlugs.includes(s))) return false;
  }
  return true;
}

function sortProducts(products: Product[], sort: string): Product[] {
  const sorted = [...products];
  switch (sort) {
    case 'newest':
      // Products don't have a date field exposed, keep original order
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

interface SearchPageProps {
  query: string;
  allProducts: Product[];
  blogPosts: BlogPost[];
}

export default function SearchPage({
  query,
  allProducts,
  blogPosts,
}: SearchPageProps) {
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [selectedSort, setSelectedSort] = useState('default');
  const [page, setPage] = useState(1);

  // Filter → sort → paginate — all client-side, instant
  const filteredProducts = useMemo(() => {
    let result = allProducts;
    if (Object.keys(activeFilters).length > 0) {
      result = result.filter((p) => productMatchesFilters(p, activeFilters));
    }
    return sortProducts(result, selectedSort);
  }, [allProducts, activeFilters, selectedSort]);

  // Derive filter groups from the FILTERED products so filters narrow each other.
  // E.g. selecting "Edible" hides sizes like "2ml" that don't apply to edibles.
  const filterGroups = useMemo(() => deriveFilterGroups(filteredProducts as any[]), [filteredProducts]);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageProducts = filteredProducts.slice(startIdx, startIdx + PAGE_SIZE);
  const hasMore = page < totalPages;
  const hasPrev = page > 1;

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (key: string, slugs: string[]) => {
    setActiveFilters((prev) => {
      const next = { ...prev, [key]: slugs };
      // Remove empty
      for (const k of Object.keys(next)) {
        if (next[k].length === 0) delete next[k];
      }
      return next;
    });
    setPage(1); // Reset to first page on filter change
  };

  const handleSortChange = (option: SelectOption | null) => {
    if (option) {
      setSelectedSort(option.value);
      setPage(1);
    }
  };

  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  return (
    <Layout
      title={query ? `Search: ${query}` : 'Search'}
      description={`Search results for "${query}"`}
    >
      <div className={styles.page}>
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.separator}>/</span>
          <span className={styles.current}>Search</span>
        </nav>

        <header className={styles.header}>
          <h1 className={styles.title}>
            {query ? <>Search results for &ldquo;{query}&rdquo;</> : 'Search'}
          </h1>
        </header>

        <div className={styles.layout}>
          <div className={styles.sidebarWrapper}>
            <ShopSidebar
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
            />
          </div>

          <main className={styles.main}>
            <div className={styles.controls}>
              <span className={styles.count}>
                {filteredProducts.length}{' '}
                {filteredProducts.length === 1 ? 'result' : 'results'}
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

            {pageProducts.length > 0 ? (
              <div className="products-grid">
                {pageProducts.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 12} />
                ))}
              </div>
            ) : query ? (
              <div className={styles.empty}>
                <h2>No results found</h2>
                <p>Try a different search term or adjust your filters.</p>
                <Link href="/shop" className="btn-primary">Browse All Products</Link>
              </div>
            ) : null}

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

        {blogPosts.length > 0 && (
          <section className={styles.blogSection}>
            <h2 className={styles.blogTitle}>Related Articles</h2>
            <div className={styles.blogGrid}>
              {blogPosts.map((post) => (
                <Link key={post.id} href={`/blogs/${post.slug}`} className={styles.blogCard}>
                  {post.featuredImage?.node?.sourceUrl && (
                    <div className={styles.blogImage}>
                      <Image
                        src={post.featuredImage.node.sourceUrl}
                        alt={post.featuredImage.node.altText || post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  )}
                  <div className={styles.blogInfo}>
                    <h3>{post.title}</h3>
                    {post.excerpt && (
                      <p dangerouslySetInnerHTML={{ __html: post.excerpt.replace(/<[^>]+>/g, '').slice(0, 120) + '...' }} />
                    )}
                    <span className={styles.blogDate}>
                      {new Date(post.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <MobileFilters
        filterGroups={filterGroups}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        productCount={filteredProducts.length}
      />
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ query: params, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

  const query = typeof params.q === 'string' ? params.q.trim() : '';

  if (!query) {
    return {
      props: { query: '', allProducts: [], blogPosts: [] },
    };
  }

  try {
    const client = getClient();

    // One product query (100 max from WPGraphQL) + blog query in parallel
    const [searchRes, blogRes] = await Promise.all([
      cachedQuery(client, {
        query: GET_PRODUCTS,
        variables: { first: SEARCH_RANK_WINDOW, search: query },
      }, { ttl: 300 }),
      cachedQuery(client, {
        query: SEARCH_BLOG_POSTS,
        variables: { search: query },
      }, { ttl: 300 }).catch(() => ({ data: null })),
    ]);

    let products = searchRes.data?.products?.nodes || [];
    products = boostTitleMatches(products, query);

    return {
      props: {
        query,
        allProducts: products,
        blogPosts: blogRes?.data?.posts?.nodes || [],
      },
    };
  } catch (error) {
    console.error('[Search Page] Query failed:', error);
    return {
      props: { query, allProducts: [], blogPosts: [] },
    };
  }
};
