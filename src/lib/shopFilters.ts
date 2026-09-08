/**
 * Shared product-filter helpers used by the four listing pages and the
 * /api/shop/products load-more endpoint. Single source of truth for filter
 * param mapping, sort variables, and facet group building.
 */

export const PAGE_SIZE = 24;

// Maps URL param keys to GraphQL `where` variable names on GET_PRODUCTS.
export const FILTER_PARAM_MAP: Record<string, string> = {
  productType: 'mfProductTypeIn',
  strainType: 'strainTypeFilterIn',
  blendType: 'blendTypeFilterIn',
  cannabinoid: 'cannabinoidFilterIn',
  singleCannabinoid: 'singleCannabinoidFilterIn',
  size: 'sizeFilterIn',
  mg: 'mgFilterIn',
  pieces: 'piecesFilterIn',
  collection: 'collectionFilterIn',
};

export type FilterControl = 'checkbox' | 'pill';

export interface FilterGroupDef {
  key: string;
  label: string;
  dataKey: string;
  control?: FilterControl;
}

// Filter group definitions: key (URL param), label (display), dataKey (from the
// GET_SHOP_FILTER_TERMS response, used by the shop page).
export const FILTER_GROUPS: FilterGroupDef[] = [
  { key: 'productType', label: 'Product Type', dataKey: 'productTypes' },
  { key: 'size', label: 'Size', dataKey: 'sizes' },
  { key: 'strainType', label: 'Strain Type', dataKey: 'strainTypes', control: 'pill' },
  { key: 'blendType', label: 'Experience Type', dataKey: 'blendTypes' },
  { key: 'cannabinoid', label: 'Cannabinoid', dataKey: 'cannabinoids' },
  { key: 'singleCannabinoid', label: 'No Blend Single Cannabinoids', dataKey: 'singleCannabinoids' },
  { key: 'mg', label: 'MG', dataKey: 'mgs' },
  { key: 'pieces', label: 'Pieces', dataKey: 'pcs' },
];

export function getGroupControl(key: string): FilterControl {
  return FILTER_GROUPS.find((g) => g.key === key)?.control || 'checkbox';
}

export const EXCLUDED_TERM_SLUGS: Record<string, string[]> = {
  productType: ['donation'],
};

export function isHiddenTerm(groupKey: string, term: { name: string; slug: string }): boolean {
  const slugs = EXCLUDED_TERM_SLUGS[groupKey];
  if (!slugs) return false;
  return slugs.includes(term.slug) || slugs.includes(term.name.toLowerCase());
}

// Maps each filter group key to the matching product taxonomy connection field.
export const FACET_PRODUCT_CONNECTION: Record<string, string> = {
  productType: 'mfproductTypes',
  size: 'size',
  strainType: 'strainTypes',
  blendType: 'blendTypes',
  cannabinoid: 'cannabinoids',
  singleCannabinoid: 'singleCannabinoid',
  mg: 'mG',
  pieces: 'pieces',
};

export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'default', label: 'Featured' },
  { value: 'best-sellers', label: 'Best Sellers' },
  { value: 'newest', label: 'Date, new to old' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
];

export interface TaxonomyTerm {
  name: string;
  slug: string;
  count: number;
}

export interface FilterGroup {
  key: string;
  label: string;
  terms: TaxonomyTerm[];
}

export type ActiveFilters = Record<string, string[]>;

/** Parse URL/query params into active filters keyed by FILTER_PARAM_MAP key. */
export function parseFilterParams(
  query: Record<string, string | string[] | undefined>,
): ActiveFilters {
  const filters: ActiveFilters = {};
  for (const key of Object.keys(FILTER_PARAM_MAP)) {
    const val = query[key];
    if (typeof val === 'string' && val) {
      filters[key] = val.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return filters;
}

/** Map active filters to GET_PRODUCTS GraphQL `where` variables. */
export function filtersToGraphQLVars(filters: ActiveFilters): Record<string, string[]> {
  const vars: Record<string, string[]> = {};
  for (const [paramKey, slugs] of Object.entries(filters)) {
    if (slugs.length > 0) {
      const gqlKey = FILTER_PARAM_MAP[paramKey];
      if (gqlKey) vars[gqlKey] = slugs;
    }
  }
  return vars;
}

/** Build a router query object (comma-joined slugs + sort) from active filters. */
export function filtersToQueryParams(filters: ActiveFilters, sort: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, slugs] of Object.entries(filters)) {
    if (slugs.length > 0) query[key] = slugs.join(',');
  }
  if (sort !== 'default') query.sort = sort;
  return query;
}

/** Convert a sort key to a GET_PRODUCTS `orderby` variable. */
export function getSortVariables(sort: string) {
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

/** Shop reads a prebuilt index, search reads taxonomy connections, so the
 *  caller supplies both lookups. */
export type FacetSlugLookup<T> = (product: T, facetKey: string) => string[];
export type FacetTermLookup = (facetKey: string) => Array<{ name: string; slug: string }>;

/**
 * Build the facet groups for a filtered listing page.
 *
 * Terms within a facet are OR'd and facets are AND'd, so facet X must be
 * counted against every active filter EXCEPT X's own. Counting against all of
 * them, which is what recomputing from the filtered list does, leaves only the
 * option just ticked and makes the rest of the facet unreachable by clicking.
 *
 * Zero count terms are kept so the panel can grey them rather than drop them.
 */
export function buildFacetGroups<T>(
  allProducts: T[],
  activeFilters: ActiveFilters,
  slugsFor: FacetSlugLookup<T>,
  termsFor: FacetTermLookup,
): FilterGroup[] {
  const matches = (product: T, filters: ActiveFilters) => {
    for (const [key, slugs] of Object.entries(filters)) {
      if (slugs.length === 0) continue;
      const productSlugs = slugsFor(product, key);
      if (!slugs.some((s) => productSlugs.includes(s))) return false;
    }
    return true;
  };

  return FILTER_GROUPS.map((fg) => {
    const universe = new Map<string, TaxonomyTerm>();
    for (const term of termsFor(fg.key)) {
      if (!term?.slug || isHiddenTerm(fg.key, term)) continue;
      universe.set(term.slug, { name: term.name, slug: term.slug, count: 0 });
    }

    const others: ActiveFilters = {};
    for (const [key, slugs] of Object.entries(activeFilters)) {
      if (key !== fg.key) others[key] = slugs;
    }

    for (const product of allProducts) {
      if (!matches(product, others)) continue;
      for (const slug of slugsFor(product, fg.key)) {
        const term = universe.get(slug);
        if (term) term.count += 1;
      }
    }

    return { key: fg.key, label: fg.label, terms: Array.from(universe.values()) };
  });
}
