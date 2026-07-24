import { GetServerSideProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { SearchIcon } from '@/components/icons';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import ShopSidebar from '@/components/shop/ShopSidebar';
import MobileFilters from '@/components/shop/MobileFilters';
import Select, { SelectOption } from '@/components/ui/Select';
import { Product } from '@/types/woocommerce';
import { Meilisearch } from 'meilisearch';
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

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  featuredImage?: { sourceUrl: string; altText: string } | null;
}

function parsePrice(price?: string): number {
  if (!price) return 0;
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

function excerptText(html: string): string {
  const node = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    RETURN_DOM: true,
  });
  return (node.textContent || '').trim().slice(0, 120) + '...';
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
      return sorted.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });
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
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(query);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [selectedSort, setSelectedSort] = useState('default');
  const [page, setPage] = useState(1);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

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

  const noProductMatches = Boolean(query) && allProducts.length === 0;
  const articlesOnly = noProductMatches && blogPosts.length > 0;

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
          <form className={styles.searchBar} onSubmit={handleSearch}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products, collections, articles..."
              className={styles.searchInput}
              autoComplete="off"
            />
            <button type="submit" className={styles.searchButton} aria-label="Search">
              <SearchIcon />
            </button>
          </form>
        </header>

        {!query ? (
          <div className={styles.emptySearch}>
            <p>Search for products, collections, and articles across the store.</p>
          </div>
        ) : articlesOnly ? (
          <p className={styles.articlesLead}>
            No products match &ldquo;{query}&rdquo;, but {blogPosts.length}{' '}
            {blogPosts.length === 1 ? 'article' : 'articles'} did.
          </p>
        ) : (
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

            <MobileFilters
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              productCount={filteredProducts.length}
            />

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
        )}

        {blogPosts.length > 0 && (
          <section
            className={articlesOnly ? `${styles.blogSection} ${styles.blogSectionOnly}` : styles.blogSection}
          >
            <h2 className={styles.blogTitle}>
              {articlesOnly ? 'Articles' : 'Related Articles'}
            </h2>
            <div className={styles.blogGrid}>
              {blogPosts.map((post) => (
                <Link key={post.id} href={`/blogs/${post.slug}`} className={styles.blogCard}>
                  {post.featuredImage?.sourceUrl && (
                    <div className={styles.blogImage}>
                      <Image
                        src={post.featuredImage.sourceUrl}
                        alt={post.featuredImage.altText || post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  )}
                  <div className={styles.blogInfo}>
                    <h3>{post.title}</h3>
                    {post.excerpt && <p>{excerptText(post.excerpt)}</p>}
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
    </Layout>
  );
}

const MEILI_HOST = process.env.MEILISEARCH_HOST || '';
const MEILI_SEARCH_KEY = process.env.MEILISEARCH_SEARCH_KEY || '';
const PRODUCTS_INDEX = 'products';
const SEARCH_RESULT_WINDOW = 100;

const MEILI_TAXONOMY: Array<{ meili: string; woo: string }> = [
  { meili: 'productType', woo: 'mfproductTypes' },
  { meili: 'size', woo: 'size' },
  { meili: 'strainType', woo: 'strainTypes' },
  { meili: 'blendType', woo: 'blendTypes' },
  { meili: 'cannabinoid', woo: 'cannabinoids' },
  { meili: 'singleCannabinoid', woo: 'singleCannabinoid' },
  { meili: 'mg', woo: 'mG' },
  { meili: 'pieces', woo: 'pieces' },
  { meili: 'collection', woo: 'collections' },
  { meili: 'strainName', woo: 'strainNames' },
  { meili: 'productLine', woo: 'productLines' },
];

function meiliHitToProduct(hit: Record<string, any>): Product {
  const product: Record<string, unknown> = {
    id: hit.id,
    databaseId: hit.databaseId,
    name: hit.name ?? '',
    slug: hit.slug ?? '',
    type: hit.type ?? undefined,
    date: hit.date ?? null,
    price: hit.price ?? '',
    regularPrice: hit.regularPrice ?? '',
    salePrice: hit.salePrice ?? '',
    stockStatus: hit.stockStatus ?? 'IN_STOCK',
    image: hit.image?.sourceUrl
      ? { sourceUrl: hit.image.sourceUrl, altText: hit.image.altText ?? hit.name ?? '' }
      : undefined,
    bbLinkedBundleId: hit.bbLinkedBundleId ?? null,
    bbFromPrice: hit.bbFromPrice ?? null,
    uniqueSellingProps: hit.uniqueSellingProps ?? undefined,
  };
  for (const { meili, woo } of MEILI_TAXONOMY) {
    const slugs: string[] = hit[`${meili}Slugs`] || [];
    const names: string[] = hit[`${meili}Names`] || [];
    product[woo] = { nodes: slugs.map((slug, i) => ({ slug, name: names[i] ?? slug })) };
  }
  return product as unknown as Product;
}

async function searchProducts(query: string): Promise<Product[]> {
  if (!MEILI_HOST || !MEILI_SEARCH_KEY) return [];
  const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_SEARCH_KEY });
  const result = await client
    .index(PRODUCTS_INDEX)
    .search<Record<string, any>>(query, { limit: SEARCH_RESULT_WINDOW });
  return result.hits.map(meiliHitToProduct);
}

async function searchBlogPosts(query: string): Promise<BlogPost[]> {
  if (!WP_URL) return [];
  const url = `${WP_URL}/wp-json/mf/v1/search-blogs?q=${encodeURIComponent(query)}&first=6`;
  const res = await fetch(url);
  const data = await res.json();
  return data.success ? data.posts : [];
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
    const [products, blogPosts] = await Promise.all([
      searchProducts(query),
      searchBlogPosts(query).catch(() => []),
    ]);

    return {
      props: {
        query,
        allProducts: products,
        blogPosts,
      },
    };
  } catch (error) {
    console.error('[Search Page] Query failed:', error);
    return {
      props: { query, allProducts: [], blogPosts: [] },
    };
  }
};
