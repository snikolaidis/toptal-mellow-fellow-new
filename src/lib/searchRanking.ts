export const SEARCH_RANK_WINDOW = 100;

export function boostTitleMatches<T extends { name: string }>(
  products: T[],
  query: string
): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return products;
  return [...products].sort((a, b) => {
    const aMatch = terms.every((t) => a.name.toLowerCase().includes(t));
    const bMatch = terms.every((t) => b.name.toLowerCase().includes(t));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });
}
