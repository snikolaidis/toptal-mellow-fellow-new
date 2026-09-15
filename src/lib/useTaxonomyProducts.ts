import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Product } from '@/types/woocommerce';
import {
  PAGE_SIZE,
  ActiveFilters,
  EMPTY_PRICE_RANGE,
  FilterGroup,
  PriceRange,
  SORT_OPTIONS,
  hasPriceRange,
  parseFilterParams,
  parsePriceRange,
  filtersToQueryParams,
  priceRangeToQueryParams,
} from '@/lib/shopFilters';

export type ProductTaxonomy = 'collection' | 'mood';

interface UseTaxonomyProductsArgs {
  slug: string;
  taxonomy: ProductTaxonomy;
  initialProducts: Product[];
  initialFilterGroups: FilterGroup[];
  initialHasNextPage: boolean;
  initialTotalPages: number;
  pageSize?: number;
}

export function useTaxonomyProducts({
  slug,
  taxonomy,
  initialProducts,
  initialFilterGroups,
  initialHasNextPage,
  initialTotalPages,
  pageSize = PAGE_SIZE,
}: UseTaxonomyProductsArgs) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  // Deliberately never recomputed from the fetched page. Every assignment below
  // resets it to the server list, so the facets keep their full shape while
  // filtering. Recomputing from the filtered results is what made ticking one
  // option remove the rest of its own facet on shop and search; if counts ever
  // need to refresh here, narrow per facet with buildFacetGroups instead.
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(initialFilterGroups);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [priceRange, setPriceRange] = useState<PriceRange>(EMPTY_PRICE_RANGE);
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
    async (filters: ActiveFilters, sort: string, targetPage: number, price: PriceRange = EMPTY_PRICE_RANGE) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('first', String(pageSize));

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

        if (price.min !== null) params.set('minPrice', String(price.min));
        if (price.max !== null) params.set('maxPrice', String(price.max));

        const res = await fetch(`/api/shop/products?${params.toString()}`);
        const data = await res.json();

        if (data.success) {
          // Without totalPages the grid cannot be paged at all, and defaulting
          // it to 1 hides the pagination silently. Refuse the response instead.
          if (typeof data.totalPages !== 'number') {
            throw new Error('/api/shop/products returned no totalPages');
          }
          setProducts(data.products || []);
          setHasNextPage(data.hasNextPage || false);
          setCurrentTotalPages(data.totalPages);
          setFilteredTotal(typeof data.total === 'number' ? data.total : null);
          usingInitialData.current = false;
        }
      } catch (err) {
        // Keep the current products rather than blanking the grid.
        console.error('[useTaxonomyProducts] page fetch failed', err);
      } finally {
        setLoading(false);
      }
    },
    [slug, taxonomy, pageSize]
  );

  // Reset state when navigating between terms (React reuses the component)
  // and apply any URL filter/sort params
  useEffect(() => {
    setProducts(initialProducts);
    setFilterGroups(initialFilterGroups);
    setActiveFilters({});
    setPriceRange(EMPTY_PRICE_RANGE);
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
    const urlPrice = parsePriceRange(router.query as Record<string, string | string[] | undefined>);
    if (Object.keys(urlFilters).length > 0 || urlSort !== 'default' || hasPriceRange(urlPrice)) {
      setActiveFilters(urlFilters);
      setSelectedSort(urlSort);
      setPriceRange(urlPrice);
      fetchPage(urlFilters, urlSort, 1, urlPrice);
    }
    // isReady, not just slug: on a cold load this runs once with an empty
    // router.query, and without it here it never runs again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, router.isReady]);

  // popstate fires on back and forward only, never on our own router.push.
  useEffect(() => {
    const onPopState = () => {
      const params = Object.fromEntries(new URLSearchParams(window.location.search));
      const urlFilters = parseFilterParams(params);
      const urlSort = typeof params.sort === 'string' && params.sort ? params.sort : 'default';
      const urlPrice = parsePriceRange(params);

      setActiveFilters(urlFilters);
      setSelectedSort(urlSort);
      setPriceRange(urlPrice);
      setPage(1);

      if (Object.keys(urlFilters).length > 0 || urlSort !== 'default' || hasPriceRange(urlPrice)) {
        fetchPage(urlFilters, urlSort, 1, urlPrice);
        return;
      }

      // Back to unfiltered restores the page's own initial data rather than
      // refetching it, matching what handleFilterChange does when the last
      // filter is cleared.
      setProducts(initialProducts);
      setFilterGroups(initialFilterGroups);
      setHasNextPage(initialHasNextPage);
      setCurrentTotalPages(initialTotalPages);
      setFilteredTotal(null);
      usingInitialData.current = true;
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [fetchPage, initialProducts, initialFilterGroups, initialHasNextPage, initialTotalPages]);

  // Shared by the filter, sort, and price handlers: reset page 1 to the page's
  // own initial data when nothing is active, otherwise refetch page 1 with the
  // combined state, then sync the URL. One place so the three stay in step.
  const applyState = useCallback(
    (filters: ActiveFilters, sort: string, price: PriceRange) => {
      setPage(1);

      const noFilters =
        Object.keys(filters).length === 0 && sort === 'default' && !hasPriceRange(price);
      if (noFilters) {
        setProducts(initialProducts);
        setFilterGroups(initialFilterGroups);
        setHasNextPage(initialHasNextPage);
        setCurrentTotalPages(initialTotalPages);
        setFilteredTotal(null);
        usingInitialData.current = true;
      } else {
        fetchPage(filters, sort, 1, price);
      }

      const queryParams = {
        ...filtersToQueryParams(filters, sort),
        ...priceRangeToQueryParams(price),
      };
      router.push(
        { pathname: router.pathname, query: { slug: router.query.slug, ...queryParams } },
        undefined,
        { shallow: true }
      );
    },
    [fetchPage, initialProducts, initialFilterGroups, initialHasNextPage, initialTotalPages, router]
  );

  const handleFilterChange = useCallback(
    (key: string, slugs: string[]) => {
      const next = { ...activeFilters, [key]: slugs };
      for (const k of Object.keys(next)) {
        if (next[k].length === 0) delete next[k];
      }
      setActiveFilters(next);
      applyState(next, selectedSort, priceRange);
    },
    [activeFilters, selectedSort, priceRange, applyState]
  );

  const handleSortChange = useCallback(
    (option: { value: string } | null) => {
      if (!option) return;
      const newSort = option.value;
      setSelectedSort(newSort);
      applyState(activeFilters, newSort, priceRange);
    },
    [activeFilters, priceRange, applyState]
  );

  const handlePriceChange = useCallback(
    (range: PriceRange) => {
      setPriceRange(range);
      applyState(activeFilters, selectedSort, range);
    },
    [activeFilters, selectedSort, applyState]
  );

  // Numbered pagination jumps to arbitrary pages, so this takes the target
  // directly rather than stepping from the current page.
  const goToPage = useCallback(
    (target: number) => {
      if (loading || target === page || target < 1) return;

      // Page one unfiltered is the payload getStaticProps already delivered, so
      // returning to it costs nothing. Refetching it was always wasted.
      if (
        target === 1 &&
        Object.keys(activeFilters).length === 0 &&
        selectedSort === 'default' &&
        !hasPriceRange(priceRange)
      ) {
        setPage(1);
        setProducts(initialProducts);
        setHasNextPage(initialHasNextPage);
        setCurrentTotalPages(initialTotalPages);
        setFilteredTotal(null);
        usingInitialData.current = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setPage(target);
      fetchPage(activeFilters, selectedSort, target, priceRange);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [
      page,
      loading,
      activeFilters,
      selectedSort,
      priceRange,
      fetchPage,
      initialProducts,
      initialHasNextPage,
      initialTotalPages,
    ]
  );

  const isFiltered =
    Object.keys(activeFilters).length > 0 || selectedSort !== 'default' || hasPriceRange(priceRange);
  const currentSort = SORT_OPTIONS.find((o) => o.value === selectedSort) || SORT_OPTIONS[0];

  return {
    products,
    filterGroups,
    loading,
    activeFilters,
    priceRange,
    selectedSort,
    currentSort,
    page,
    hasNextPage,
    totalPages: currentTotalPages,
    filteredTotal,
    isFiltered,
    handleFilterChange,
    handleSortChange,
    handlePriceChange,
    goToPage,
  };
}
