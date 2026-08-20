import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Product } from '@/types/woocommerce';
import {
  PAGE_SIZE,
  ActiveFilters,
  FilterGroup,
  SORT_OPTIONS,
  parseFilterParams,
  filtersToQueryParams,
} from '@/lib/shopFilters';

export type ProductTaxonomy = 'collection' | 'mood';

interface UseTaxonomyProductsArgs {
  slug: string;
  taxonomy: ProductTaxonomy;
  initialProducts: Product[];
  initialFilterGroups: FilterGroup[];
  initialHasNextPage: boolean;
  initialTotalPages: number;
}

export function useTaxonomyProducts({
  slug,
  taxonomy,
  initialProducts,
  initialFilterGroups,
  initialHasNextPage,
  initialTotalPages,
}: UseTaxonomyProductsArgs) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(initialFilterGroups);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [selectedSort, setSelectedSort] = useState('default');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [currentTotalPages, setCurrentTotalPages] = useState(initialTotalPages);
  // The endpoint's own count of everything matching the filters, which
  // `products.length` is not: that is capped at PAGE_SIZE. null while the page
  // is on its unfiltered initial data and the caller's own total applies.
  const [filteredTotal, setFilteredTotal] = useState<number | null>(null);

  const usingInitialData = useRef(true);

  const fetchPage = useCallback(
    async (filters: ActiveFilters, sort: string, targetPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('first', String(PAGE_SIZE));

        // Both of these fail silently with a 200 if changed. The slug travels
        // under `collection` for every taxonomy: the BFF branches on that param
        // being present (api/shop/products.ts:56), so renaming it to `mood`
        // returns the whole unfiltered catalogue. Dropping `taxonomy` looks up
        // the mood slug in the collection taxonomy and returns nothing.
        params.set('collection', slug);
        params.set('page', String(targetPage));
        if (taxonomy !== 'collection') params.set('taxonomy', taxonomy);

        if (sort !== 'default') params.set('sort', sort);

        for (const [key, slugs] of Object.entries(filters)) {
          if (slugs.length > 0) params.set(key, slugs.join(','));
        }

        const res = await fetch(`/api/shop/products?${params.toString()}`);
        const data = await res.json();

        if (data.success) {
          setProducts(data.products || []);
          setHasNextPage(data.hasNextPage || false);
          setCurrentTotalPages(data.totalPages || 1);
          setFilteredTotal(typeof data.total === 'number' ? data.total : null);
          usingInitialData.current = false;
        }
      } catch {
        // keep current products on network error
      } finally {
        setLoading(false);
      }
    },
    [slug, taxonomy]
  );

  // Reset state when navigating between terms (React reuses the component)
  // and apply any URL filter/sort params
  useEffect(() => {
    setProducts(initialProducts);
    setFilterGroups(initialFilterGroups);
    setActiveFilters({});
    setSelectedSort('default');
    setPage(1);
    setHasNextPage(initialHasNextPage);
    setCurrentTotalPages(initialTotalPages);
    setFilteredTotal(null);
    setLoading(false);
    usingInitialData.current = true;

    if (!router.isReady) return;
    const urlFilters = parseFilterParams(router.query as Record<string, string | string[] | undefined>);
    const urlSort = typeof router.query.sort === 'string' ? router.query.sort : 'default';
    if (Object.keys(urlFilters).length > 0 || urlSort !== 'default') {
      setActiveFilters(urlFilters);
      setSelectedSort(urlSort);
      fetchPage(urlFilters, urlSort, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleFilterChange = useCallback(
    (key: string, slugs: string[]) => {
      setActiveFilters((prev) => {
        const next = { ...prev, [key]: slugs };
        for (const k of Object.keys(next)) {
          if (next[k].length === 0) delete next[k];
        }

        const noFilters = Object.keys(next).length === 0 && selectedSort === 'default';
        if (noFilters && usingInitialData.current === false) {
          setProducts(initialProducts);
          setFilterGroups(initialFilterGroups);
          setHasNextPage(initialHasNextPage);
          setCurrentTotalPages(initialTotalPages);
          setFilteredTotal(null);
          usingInitialData.current = true;
        } else if (!noFilters) {
          fetchPage(next, selectedSort, 1);
        }

        setPage(1);

        const queryParams = filtersToQueryParams(next, selectedSort);
        router.push(
          { pathname: router.pathname, query: { slug: router.query.slug, ...queryParams } },
          undefined,
          { shallow: true }
        );

        return next;
      });
    },
    [selectedSort, fetchPage, initialProducts, initialFilterGroups, initialHasNextPage, initialTotalPages, router]
  );

  const handleSortChange = useCallback(
    (option: { value: string } | null) => {
      if (!option) return;
      const newSort = option.value;
      setSelectedSort(newSort);
      setPage(1);

      const noFilters = Object.keys(activeFilters).length === 0 && newSort === 'default';
      if (noFilters) {
        setProducts(initialProducts);
        setFilterGroups(initialFilterGroups);
        setHasNextPage(initialHasNextPage);
        setCurrentTotalPages(initialTotalPages);
        setFilteredTotal(null);
        usingInitialData.current = true;
      } else {
        fetchPage(activeFilters, newSort, 1);
      }

      const queryParams = filtersToQueryParams(activeFilters, newSort);
      router.push(
        { pathname: router.pathname, query: { slug: router.query.slug, ...queryParams } },
        undefined,
        { shallow: true }
      );
    },
    [activeFilters, fetchPage, initialProducts, initialFilterGroups, initialHasNextPage, initialTotalPages, router]
  );

  const goToNextPage = useCallback(() => {
    if (!hasNextPage || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(activeFilters, selectedSort, nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, hasNextPage, loading, activeFilters, selectedSort, fetchPage]);

  const goToPrevPage = useCallback(() => {
    if (page <= 1 || loading) return;
    const prevPage = page - 1;

    if (prevPage === 1 && Object.keys(activeFilters).length === 0 && selectedSort === 'default') {
      setPage(1);
      setProducts(initialProducts);
      setHasNextPage(initialHasNextPage);
      setCurrentTotalPages(initialTotalPages);
      setFilteredTotal(null);
      usingInitialData.current = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setPage(prevPage);
    fetchPage(activeFilters, selectedSort, prevPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, loading, activeFilters, selectedSort, fetchPage, initialProducts, initialHasNextPage, initialTotalPages]);

  const isFiltered = Object.keys(activeFilters).length > 0 || selectedSort !== 'default';
  const currentSort = SORT_OPTIONS.find((o) => o.value === selectedSort) || SORT_OPTIONS[0];

  return {
    products,
    filterGroups,
    loading,
    activeFilters,
    selectedSort,
    currentSort,
    page,
    hasNextPage,
    totalPages: currentTotalPages,
    filteredTotal,
    isFiltered,
    handleFilterChange,
    handleSortChange,
    goToNextPage,
    goToPrevPage,
  };
}
