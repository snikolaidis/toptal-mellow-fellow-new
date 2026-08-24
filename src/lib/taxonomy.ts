// The REST products endpoint keys off WordPress taxonomy names, while GraphQL
// hands back type names. Anything not listed here falls back to `collection`
// server side (see mellow-fellow-taxonomy-param.php), which silently returns the
// wrong products rather than erroring, so new taxonomies must be added in both.
const TAXONOMY_BY_TYPENAME: Record<string, string> = {
  collection: 'collection',
  mood: 'mood',
  productcategory: 'product_cat',
};

export function taxonomyForTypename(typename?: string | null) {
  const key = (typename || 'Collection').toLowerCase();
  return TAXONOMY_BY_TYPENAME[key] ?? 'collection';
}
