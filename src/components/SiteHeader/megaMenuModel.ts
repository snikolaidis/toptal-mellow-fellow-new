import { MegaMenuFeaturedLink, NavMenuItem, isRealHref } from '@/graphql/queries/menus';
import { ProductIcon, getProductIcon } from '@/lib/productIcons';
import { MoodPill } from '@/types/mood';

// HHC is deliberately absent: it became illegal.
const CANNABINOID_LINKS = [
  { label: 'Delta-8 THC', uri: '/collections/delta-8' },
  { label: 'Delta-9 THC', uri: '/collections/delta-9' },
  { label: 'THCp', uri: '/collections/thcp' },
  { label: 'CBD / Wellness', uri: '/collections/cbd' },
];

// WordPress omits the trailing slash today, but the permalink setting can add
// one, and then the icon lookup and the PRIMARY match both miss on every item.
export const normalizeUri = (uri: string) => uri.replace(/\/+$/, '');

const slugFromUri = (uri: string) => normalizeUri(uri).split('/').pop() ?? '';

export interface MegaMenuProduct {
  key: string;
  slug: string;
  item: NavMenuItem;
  icon?: ProductIcon;
  children: NavMenuItem[];
  hasChildren: boolean;
}

export interface MegaMenuFeatured {
  label: string;
  url: string;
  target?: string;
}

export interface MegaMenuModel {
  products: MegaMenuProduct[];
  /** Artwork presence is also the frame's chevron versus plain-link split. */
  illustrated: MegaMenuProduct[];
  plain: MegaMenuProduct[];
  moods: MoodPill[];
  cannabinoids: typeof CANNABINOID_LINKS;
  featured: MegaMenuFeatured[];
}

interface BuildArgs {
  productItems: NavMenuItem[];
  navItems: NavMenuItem[];
  moods: MoodPill[];
  featuredLinks: MegaMenuFeaturedLink[];
}

export function buildMegaMenuModel({
  productItems,
  navItems,
  moods,
  featuredLinks,
}: BuildArgs): MegaMenuModel {
  // Matched on uri, not label: the same destination is "Shop All Products" in
  // one menu and "More" in the other.
  const childrenByUri = new Map<string, NavMenuItem[]>();
  for (const item of navItems) {
    const children = item.childItems?.nodes ?? [];
    if (children.length > 0) childrenByUri.set(normalizeUri(item.uri), children);
  }

  const products: MegaMenuProduct[] = [];
  for (const item of productItems) {
    if (!isRealHref(item.uri)) continue;
    const key = normalizeUri(item.uri);
    const slug = slugFromUri(item.uri);
    const children = childrenByUri.get(key) ?? [];
    products.push({
      key,
      slug,
      item,
      icon: getProductIcon(slug),
      children,
      hasChildren: children.length > 0,
    });
  }

  const featured: MegaMenuFeatured[] = featuredLinks.flatMap((entry) => {
    const url = entry.link?.url;
    const label = entry.label || entry.link?.title;
    if (!label || !url || url === '#') return [];
    return [{ label, url, target: entry.link?.target || undefined }];
  });

  return {
    products,
    illustrated: products.filter((p) => p.icon),
    plain: products.filter((p) => !p.icon),
    moods,
    cannabinoids: CANNABINOID_LINKS,
    featured,
  };
}
