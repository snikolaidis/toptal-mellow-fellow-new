const STORAGE_KEY = 'mf_recently_viewed';
const MAX_ITEMS = 12;

export interface RecentProduct {
  databaseId: number;
  slug: string;
  name: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
  image?: { sourceUrl: string; altText: string };
  typeLabel?: string;
}

export function addRecentlyViewed(item: RecentProduct): void {
  if (typeof window === 'undefined' || !item?.slug) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: RecentProduct[] = raw ? JSON.parse(raw) : [];
    const next = [item, ...list.filter((p) => p.slug !== item.slug)].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

export function getRecentlyViewed(excludeSlug?: string): RecentProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: RecentProduct[] = raw ? JSON.parse(raw) : [];
    return excludeSlug ? list.filter((p) => p.slug !== excludeSlug) : list;
  } catch {
    return [];
  }
}
