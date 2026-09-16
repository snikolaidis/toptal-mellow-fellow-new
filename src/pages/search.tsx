import { GetServerSideProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { SearchIcon } from '@/components/icons';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import FilterPanel from '@/components/shop/filters/FilterPanel';
import FilterSheet from '@/components/shop/filters/FilterSheet';
import Select, { SelectOption } from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import { Product } from '@/types/woocommerce';
import { capQuery, getSearchClient, isSearchConfigured } from '@/lib/search-client';
import {
  SORT_OPTIONS,
  FACET_PRODUCT_CONNECTION,
  FilterGroup,
  ActiveFilters,
  buildFacetGroups,
  parseFilterParams,
  filtersToQueryParams,
} from '@/lib/shopFilters';
import styles from '@/styles/pages/search.module.css';
import gridStyles from '@/styles/shared/product-grid.module.css';

const sortOptions: SelectOption[] = SORT_OPTIONS;
const PAGE_SIZE = 24;

interface BlogPost {
  id: number;
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

function isBestSeller(product: Product): boolean {
  const collections = (product as any).collections?.nodes;
  if (!Array.isArray(collections)) return false;
  return collections.some((c: { slug?: string }) => c.slug === 'best-sellers');
}

function sortProducts(products: Product[], sort: string): Product[] {
  const sorted = [...products];
  switch (sort) {
    case 'best-sellers':
      return sorted.sort((a, b) => {
        const aIs = isBestSeller(a) ? 0 : 1;
        const bIs = isBestSeller(b) ? 0 : 1;
        return aIs - bIs;
      });
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
  productsFailed: boolean;
  blogsFailed: boolean;
  initialFilters: ActiveFilters;
  initialSort: string;
}

export default function SearchPage({
  query,
  allProducts,
  blogPosts,
  productsFailed,
  blogsFailed,
  initialFilters,
  initialSort,
}: SearchPageProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(query);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(initialFilters);
  const [selectedSort, setSelectedSort] = useState(initialSort);
  const [page, setPage] = useState(1);

  // `q` must be carried through. Dropping it navigates away from the user's
  // own search results.
  const syncUrl = (filters: ActiveFilters, sort: string) => {
    const queryParams = filtersToQueryParams(filters, sort);
    router.push(
      { pathname: '/search', query: { q: query, ...queryParams } },
      undefined,
      { shallow: true }
    );
  };

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const retrySearch = () => {
    router.replace(router.asPath);
  };

  // Filter → sort → paginate — all client-side, instant
  const filteredProducts = useMemo(() => {
    let result = allProducts;
    if (Object.keys(activeFilters).length > 0) {
      result = result.filter((p) => productMatchesFilters(p, activeFilters));
    }
    return sortProducts(result, selectedSort);
  }, [allProducts, activeFilters, selectedSort]);

  // allProducts, never filteredProducts: passing the filtered set here is what
  // left only the option just ticked in that facet.
  const filterGroups = useMemo(
    () =>
      buildFacetGroups(
        allProducts,
        activeFilters,
        (product, facetKey) => {
          const connection = FACET_PRODUCT_CONNECTION[facetKey];
          if (!connection) return [];
          const nodes: Array<{ slug?: string }> = (product as any)?.[connection]?.nodes || [];
          return nodes.map((t) => t.slug).filter(Boolean) as string[];
        },
        (facetKey) => {
          const connection = FACET_PRODUCT_CONNECTION[facetKey];
          if (!connection) return [];
          const seen = new Map<string, { name: string; slug: string }>();
          for (const product of allProducts) {
            const nodes: Array<{ name?: string; slug?: string }> =
              (product as any)?.[connection]?.nodes || [];
            for (const t of nodes) {
              if (t?.slug && !seen.has(t.slug)) seen.set(t.slug, { name: t.name || t.slug, slug: t.slug });
            }
          }
          return Array.from(seen.values());
        },
      ),
    [allProducts, activeFilters],
  );

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
      syncUrl(next, selectedSort);
      return next;
    });
    setPage(1); // Reset to first page on filter change
  };

  const handleSortChange = (option: SelectOption | null) => {
    if (option) {
      setSelectedSort(option.value);
      setPage(1);
      syncUrl(activeFilters, option.value);
    }
  };

  const currentSort = sortOptions.find((o) => o.value === selectedSort) || sortOptions[0];

  const searchUnavailable = Boolean(query) && productsFailed;
  const noProductMatches = Boolean(query) && !productsFailed && allProducts.length === 0;
  const articlesOnly = noProductMatches && blogPosts.length > 0;
  const articlesStandalone = articlesOnly || (searchUnavailable && blogPosts.length > 0);

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
        ) : searchUnavailable ? (
          <div className={styles.empty}>
            <h2>
              {blogsFailed
                ? 'Search is temporarily unavailable'
                : 'Product search is temporarily unavailable'}
            </h2>
            <p>
              Something went wrong on our end, not with your search. Please try again in a
              moment.
            </p>
            <button type="button" onClick={retrySearch} className="btn-primary">
              Try again
            </button>
            <Link href="/shop" className="btn-secondary">Browse all products</Link>
          </div>
        ) : articlesOnly ? (
          <p className={styles.articlesLead}>
            No products match &ldquo;{query}&rdquo;, but {blogPosts.length}{' '}
            {blogPosts.length === 1 ? 'article' : 'articles'} did.
          </p>
        ) : (
        <div className={styles.layout}>
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

            <FilterSheet
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              productCount={filteredProducts.length}
              sortValue={currentSort}
              onSortChange={handleSortChange}
            />

            {pageProducts.length > 0 ? (
              <div className={gridStyles.productGrid}>
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

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              label="Search results pagination"
            />
          </main>
        </div>
        )}

        {blogPosts.length > 0 && (
          <section
            className={articlesStandalone ? `${styles.blogSection} ${styles.blogSectionOnly}` : styles.blogSection}
          >
            <h2 className={styles.blogTitle}>
              {articlesStandalone ? 'Articles' : 'Related Articles'}
            </h2>
            <div className={styles.blogGrid}>
              {blogPosts.map((post) => (
                <Link key={post.id} href={`/blogs/learn/${post.slug}`} className={styles.blogCard}>
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

const PRODUCTS_INDEX = 'products';
const POSTS_INDEX = 'posts';
const SEARCH_RESULT_WINDOW = 100;
const BLOG_RESULT_LIMIT = 6;

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
    date: hit.date ?? null,
    price: hit.price ?? '',
    regularPrice: hit.regularPrice ?? '',
    salePrice: hit.salePrice ?? '',
    stockStatus: hit.stockStatus ?? 'IN_STOCK',
    bbBundleMode: hit.bbBundleMode ?? null,
    bbFromPrice: hit.bbFromPrice ?? null,
    bbShowPrice: hit.bbShowPrice ?? null,
    bbFixedPrice: hit.bbFixedPrice ?? null,
    bbFixedOriginalPrice: hit.bbFixedOriginalPrice ?? null,
  };

  // Left off entirely rather than set to undefined. The index stores null for all
  // three, getServerSideProps refuses to serialize undefined and fails the whole
  // page, and Product declares them optional but not nullable.
  if (hit.type) product.type = hit.type;
  if (hit.image?.sourceUrl) {
    product.image = {
      sourceUrl: hit.image.sourceUrl,
      altText: hit.image.altText ?? hit.name ?? '',
    };
  }
  if (hit.uniqueSellingProps) product.uniqueSellingProps = hit.uniqueSellingProps;

  for (const { meili, woo } of MEILI_TAXONOMY) {
    const slugs: string[] = hit[`${meili}Slugs`] || [];
    const names: string[] = hit[`${meili}Names`] || [];
    product[woo] = { nodes: slugs.map((slug, i) => ({ slug, name: names[i] ?? slug })) };
  }
  return product as unknown as Product;
}

async function searchProducts(query: string): Promise<Product[]> {
  if (!isSearchConfigured()) throw new Error('Search is not configured');
  const result = await getSearchClient()
    .index(PRODUCTS_INDEX)
    .search<Record<string, any>>(query, { limit: SEARCH_RESULT_WINDOW });
  return result.hits.map(meiliHitToProduct);
}

async function searchBlogPosts(query: string): Promise<BlogPost[]> {
  if (!isSearchConfigured()) throw new Error('Search is not configured');
  const result = await getSearchClient().index(POSTS_INDEX).search<Record<string, any>>(query, {
    limit: BLOG_RESULT_LIMIT,
    sort: ['date:desc'],
    attributesToRetrieve: ['databaseId', 'title', 'slug', 'date', 'excerpt', 'featuredImage'],
  });
  return result.hits.map((hit) => ({
    id: hit.databaseId,
    title: hit.title || '',
    slug: hit.slug || '',
    date: hit.date || '',
    excerpt: hit.excerpt || '',
    featuredImage: hit.featuredImage?.sourceUrl
      ? { sourceUrl: hit.featuredImage.sourceUrl, altText: hit.featuredImage.altText || '' }
      : null,
  }));
}

export const getServerSideProps: GetServerSideProps = async ({ query: params, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

  const query = typeof params.q === 'string' ? capQuery(params.q.trim()) : '';

  const initialFilters = parseFilterParams(params);
  const initialSort = typeof params.sort === 'string' && params.sort ? params.sort : 'default';

  if (!query) {
    const menuClient = await prefetchMenus();
    const props: Record<string, any> = {
      query: '',
      allProducts: [],
      blogPosts: [],
      productsFailed: false,
      blogsFailed: false,
      initialFilters,
      initialSort,
    };
    mergeMenuState(props, menuClient);
    return { props };
  }

  const [products, blogPosts, menuClient] = await Promise.all([
    searchProducts(query).catch((error) => {
      console.error('[Search Page] Product query failed:', error);
      return null;
    }),
    searchBlogPosts(query).catch((error) => {
      console.error('[Search Page] Blog query failed:', error);
      return null;
    }),
    prefetchMenus(),
  ]);

  // Overrides the header set above, which would otherwise pin a degraded page
  // for two minutes and serve it stale for ten more.
  if (products === null || blogPosts === null) {
    res.setHeader('Cache-Control', 'no-store');
  }

  const props: Record<string, any> = {
    query,
    allProducts: products ?? [],
    blogPosts: blogPosts ?? [],
    productsFailed: products === null,
    blogsFailed: blogPosts === null,
    initialFilters,
    initialSort,
  };
  mergeMenuState(props, menuClient);

  return { props };
};
