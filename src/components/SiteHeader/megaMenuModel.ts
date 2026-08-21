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
// one, and then the icon lookup misses on every item.
const normalizeUri = (uri: string) => uri.replace(/\/+$/, '');

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
  moods: MoodPill[];
  featuredLinks: MegaMenuFeaturedLink[];
}

export function buildMegaMenuModel({
  productItems,
  moods,
  featuredLinks,
}: BuildArgs): MegaMenuModel {
  const products: MegaMenuProduct[] = [];
  for (const item of productItems) {
    if (!isRealHref(item.uri)) continue;
    const slug = slugFromUri(item.uri);
    const children = item.childItems?.nodes ?? [];
    products.push({
      key: normalizeUri(item.uri),
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
