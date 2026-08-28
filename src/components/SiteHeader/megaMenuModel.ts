import {
  MegaMenuFeaturedLink,
  NavMenuItem,
  PromotionalSlide,
  SlideImageEdge,
  isRealHref,
} from '@/graphql/queries/menus';
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

// The two entries the frame puts below the product column's divider. Once these
// carry artwork too, icon presence no longer tells the groups apart.
const CATCH_ALL_SLUG = 'all';
const TAIL_SLUGS = new Set(['bundles', CATCH_ALL_SLUG]);

// Lifted out of Shop All Products' children into the mobile product list.
// Matched on the collection slug, so repointing one in wp-admin drops its row
// rather than pointing it somewhere else.
const PROMOTED: Array<{ slug: string; icon?: string }> = [
  { slug: 'terp-sauce-2ml-syringes-thca-blends', icon: 'syringes' },
  { slug: 'accessories' },
];

const LEARN_LABEL = 'learn';

export interface MegaMenuProduct {
  key: string;
  slug: string;
  item: NavMenuItem;
  icon?: ProductIcon;
  children: NavMenuItem[];
  hasChildren: boolean;
  isTail: boolean;
}

export interface MegaMenuPromoted {
  key: string;
  item: NavMenuItem;
  icon?: ProductIcon;
}

export interface MegaMenuFeatured {
  label: string;
  url: string;
  target?: string;
}

export interface MegaMenuSlideImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface MegaMenuSlide {
  key: string;
  caption?: string;
  url?: string;
  target?: string;
  desktop?: MegaMenuSlideImage;
  tablet?: MegaMenuSlideImage;
  mobile?: MegaMenuSlideImage;
  /**
   * What <img> shows when no <source> matches. Mobile first, matching the hero
   * block: reversing it makes a phone with no mobile asset download the 2560px
   * desktop file.
   */
  fallback: MegaMenuSlideImage;
}

export interface MegaMenuModel {
  products: MegaMenuProduct[];
  /** The two groups the frame's divider separates, in render order. */
  categories: MegaMenuProduct[];
  tail: MegaMenuProduct[];
  /** Mobile only: rows lifted out of the catch-all's children. */
  promoted: MegaMenuPromoted[];
  moods: MoodPill[];
  cannabinoids: typeof CANNABINOID_LINKS;
  featured: MegaMenuFeatured[];
  slides: MegaMenuSlide[];
  /** Mobile only: Primary's Learn children, which have no mega menu entry. */
  learn: NavMenuItem[];
}

interface BuildArgs {
  productItems: NavMenuItem[];
  navItems: NavMenuItem[];
  moods: MoodPill[];
  featuredLinks: MegaMenuFeaturedLink[];
  promotionalSlides: PromotionalSlide[];
}

const slideImage = (
  edge: SlideImageEdge | null | undefined,
  caption?: string
): MegaMenuSlideImage | undefined => {
  const node = edge?.node;
  if (!node?.sourceUrl) return undefined;
  return {
    src: node.sourceUrl,
    // altText is empty on every slide today, so the caption is the only text
    // the image can offer a screen reader.
    alt: node.altText || caption || '',
    width: node.mediaDetails?.width ?? undefined,
    height: node.mediaDetails?.height ?? undefined,
  };
};

export function buildMegaMenuModel({
  productItems,
  navItems,
  moods,
  featuredLinks,
  promotionalSlides,
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
      isTail: TAIL_SLUGS.has(slug),
    });
  }

  const featured: MegaMenuFeatured[] = featuredLinks.flatMap((entry) => {
    const url = entry.link?.url;
    const label = entry.label || entry.link?.title;
    if (!label || !url || url === '#') return [];
    return [{ label, url, target: entry.link?.target || undefined }];
  });

  // A row with no image at all would still take a dot and leave the frame
  // blank, so it is dropped rather than rendered empty.
  const slides: MegaMenuSlide[] = promotionalSlides.flatMap((slide, i) => {
    const caption = slide.caption?.trim() || undefined;
    const desktop = slideImage(slide.desktopImage, caption);
    const tablet = slideImage(slide.tabletImage, caption);
    const mobile = slideImage(slide.mobileImage, caption);
    const fallback = mobile ?? tablet ?? desktop;
    if (!fallback) return [];

    const url = slide.link?.url;
    return [
      {
        // Index included: the same collection can legitimately be promoted
        // twice, and nothing else on the row is guaranteed unique.
        key: `${i}-${fallback.src}`,
        caption,
        url: url && url !== '#' ? url : undefined,
        target: slide.link?.target || undefined,
        desktop,
        tablet,
        mobile,
        fallback,
      },
    ];
  });

  const catchAllChildren =
    products.find((p) => p.slug === CATCH_ALL_SLUG)?.children ?? [];

  const promoted: MegaMenuPromoted[] = PROMOTED.flatMap(({ slug, icon }) => {
    const item = catchAllChildren.find((c) => slugFromUri(c.uri) === slug);
    if (!item) return [];
    return [
      {
        key: normalizeUri(item.uri),
        item,
        icon: icon ? getProductIcon(icon) : undefined,
      },
    ];
  });

  const learn =
    navItems.find((i) => i.label.trim().toLowerCase() === LEARN_LABEL)
      ?.childItems?.nodes ?? [];

  return {
    products,
    categories: products.filter((p) => !p.isTail),
    tail: products.filter((p) => p.isTail),
    promoted,
    moods,
    cannabinoids: CANNABINOID_LINKS,
    featured,
    slides,
    learn,
  };
}
