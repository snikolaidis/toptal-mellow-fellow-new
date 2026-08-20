import Image from 'next/image';
import Link from 'next/link';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  MegaMenuFeaturedLink,
  NavMenuItem,
  isRealHref,
} from '@/graphql/queries/menus';
import { ProductIcon, getProductIcon, scaleIcon } from '@/lib/productIcons';
import { decodeEntities } from '@/lib/decodeEntities';
import { MoodPill } from '@/types/mood';

interface ShopMegaMenuProps {
  id: string;
  labelledBy: string;
  shouldFocus: boolean;
  productItems: NavMenuItem[];
  navItems: NavMenuItem[];
  moods: MoodPill[];
  featuredLinks: MegaMenuFeaturedLink[];
}

// HHC is deliberately absent: it became illegal.
const CANNABINOID_LINKS = [
  { label: 'Delta-8 THC', uri: '/collections/delta-8' },
  { label: 'Delta-9 THC', uri: '/collections/delta-9' },
  { label: 'THCp', uri: '/collections/thcp' },
  { label: 'CBD / Wellness', uri: '/collections/cbd' },
];

const HEADING_IDS = {
  product: 'shop-mega-heading-product',
  mood: 'shop-mega-heading-mood',
  cannabinoids: 'shop-mega-heading-cannabinoids',
  featured: 'shop-mega-heading-featured',
  sub: 'shop-mega-heading-sub',
};

// Frame box per item, not the files' own ratios. Four of them are the header's
// existing search/cart icon size. object-fit keeps the artwork undistorted
// inside a box it does not match.
const ICON_BOX: Record<string, { width: number; height: number }> = {
  'disposable-vapes': { width: 24.02, height: 28 },
  'vape-cartridges': { width: 24.02, height: 28 },
  flower: { width: 24.02, height: 28 },
  concentrates: { width: 24.02, height: 28 },
  edibles: { width: 24, height: 14 },
  drinks: { width: 27, height: 27 },
};

const ICON_FALLBACK_HEIGHT = 28;

// Shop All Products is excepted from the panel typography, pending its own.
const UNTYPED_SLUG = 'all';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// WordPress serves these without a trailing slash today, but the permalink
// setting can add one, and then both the icon lookup and the PRIMARY match
// below would silently miss on every item at once.
const normalizeUri = (uri: string) => uri.replace(/\/+$/, '');

const slugFromUri = (uri: string) => normalizeUri(uri).split('/').pop() ?? '';

const ShopMegaMenu = forwardRef<HTMLDivElement, ShopMegaMenuProps>(
  function ShopMegaMenu(
    { id, labelledBy, shouldFocus, productItems, navItems, moods, featuredLinks },
    ref
  ) {
    const navRef = useRef<HTMLElement>(null);

    useEffect(() => {
      if (!shouldFocus) return;
      // The fallback is what a keyboard open lands on when the menu query
      // returns nothing. Without it focus moves nowhere at all.
      const first = navRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? navRef.current)?.focus();
    }, [shouldFocus]);

    // SHOP_MEGA_MENU is flat, so the sub items come from PRIMARY, matched on
    // uri. Label is not usable as a key: the same destination is "Shop All
    // Products" in one menu and "More" in the other.
    const subsByUri = useMemo(() => {
      const map = new Map<string, NavMenuItem[]>();
      for (const item of navItems) {
        const children = item.childItems?.nodes ?? [];
        if (children.length > 0) map.set(normalizeUri(item.uri), children);
      }
      return map;
    }, [navItems]);

    // Splitting on whether artwork exists, rather than on position or slug,
    // survives the menu being reordered in wp-admin. An item added without
    // artwork drops below the divider instead of rendering a broken image.
    const illustrated: {
      item: NavMenuItem;
      icon: ProductIcon;
      box: { width: number; height: number };
    }[] = [];
    const plain: NavMenuItem[] = [];

    for (const item of productItems) {
      if (!isRealHref(item.uri)) continue;
      const slug = slugFromUri(item.uri);
      const icon = getProductIcon(slug);
      if (icon) {
        const box = ICON_BOX[slug] ?? scaleIcon(icon, ICON_FALLBACK_HEIGHT);
        illustrated.push({ item, icon, box });
      } else plain.push(item);
    }

    const featured = featuredLinks.flatMap((item) => {
      const url = item.link?.url;
      const label = item.label || item.link?.title;
      if (!label || !url || url === '#') return [];
      return [{ label, url, target: item.link?.target || undefined }];
    });

    const [activeUri, setActiveUri] = useState<string | null>(null);

    const fallbackUri =
      productItems.find((item) => subsByUri.has(normalizeUri(item.uri)))?.uri ?? null;

    // Resolving the default at render rather than seeding state in an effect
    // keeps the panel populated on its very first paint, before any hover.
    const currentUri = activeUri ?? (fallbackUri && normalizeUri(fallbackUri));
    const activeItem = productItems.find(
      (item) => normalizeUri(item.uri) === currentUri
    );
    const activeSubs = currentUri ? subsByUri.get(currentUri) ?? [] : [];

    // Items with no sub items leave the panel showing whatever was there, so it
    // is never empty.
    const activate = (uri: string) => {
      const key = normalizeUri(uri);
      if (subsByUri.has(key)) setActiveUri(key);
    };

    const productLink = (
      item: NavMenuItem,
      icon?: ProductIcon,
      box?: { width: number; height: number }
    ) => {
      const className = [
        'site-header__mega-link',
        icon ? '' : 'site-header__mega-link--plain',
        slugFromUri(item.uri) === UNTYPED_SLUG ? '' : 'site-header__mega-type',
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <li key={item.id}>
          <Link
            href={item.uri}
            className={className}
            aria-current={
              normalizeUri(item.uri) === currentUri ? 'true' : undefined
            }
            onMouseEnter={() => activate(item.uri)}
            onFocus={() => activate(item.uri)}
          >
            {icon && box && (
              <Image
                className="site-header__mega-icon"
                src={icon.src}
                alt=""
                // Rounded for the srcset next/image generates; the exact frame
                // size is the style below, which is what actually lays out.
                width={Math.round(box.width)}
                height={Math.round(box.height)}
                style={{ width: `${box.width}px`, height: `${box.height}px` }}
              />
            )}
            <span>{item.label}</span>
          </Link>
        </li>
      );
    };

    return (
      <div id={id} ref={ref} className="site-header__mega">
        <nav
          ref={navRef}
          className="site-header__mega-card"
          aria-labelledby={labelledBy}
          tabIndex={-1}
        >
          <div className="site-header__mega-col">
            <h2 id={HEADING_IDS.product} className="site-header__mega-heading">
              Shop by Product
            </h2>

            {illustrated.length > 0 && (
              <ul className="site-header__mega-list">
                {illustrated.map(({ item, icon, box }) =>
                  productLink(item, icon, box)
                )}
              </ul>
            )}

            {illustrated.length > 0 && plain.length > 0 && (
              <span className="site-header__mega-divider" aria-hidden="true" />
            )}

            {plain.length > 0 && (
              <ul className="site-header__mega-list">
                {plain.map((item) => productLink(item))}
              </ul>
            )}
          </div>

          <div className="site-header__mega-col">
            <h2 id={HEADING_IDS.mood} className="site-header__mega-heading">
              Shop by Mood
            </h2>
            {moods.length > 0 && (
              <ul className="site-header__mega-list site-header__mega-list--text">
                {moods.map((mood) => (
                  <li key={mood.slug}>
                    <Link
                      href={`/moods/${mood.slug}`}
                      className="site-header__mega-text-link site-header__mega-type"
                    >
                      {decodeEntities(mood.name)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="site-header__mega-col">
            <h2 id={HEADING_IDS.cannabinoids} className="site-header__mega-heading">
              Cannabinoids
            </h2>
            <ul className="site-header__mega-list site-header__mega-list--text">
              {CANNABINOID_LINKS.map((item) => (
                <li key={item.uri}>
                  <Link
                    href={item.uri}
                    className="site-header__mega-text-link site-header__mega-type"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="site-header__mega-col">
            <h2 id={HEADING_IDS.featured} className="site-header__mega-heading">
              Featured
            </h2>

            {/* The image carousel goes here, above the links. It shares a Site
                Settings group with the homepage carousel, which does not exist
                yet, so there is nothing to render from. */}

            {featured.length > 0 && (
              <ul className="site-header__mega-list site-header__mega-list--text">
                {featured.map(({ label, url, target }) => (
                  <li key={url}>
                    <Link
                      href={url}
                      className="site-header__mega-text-link"
                      target={target}
                      rel={target === '_blank' ? 'noreferrer' : undefined}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="site-header__mega-sub">
            {activeItem && (
              <>
                <h2 id={HEADING_IDS.sub} className="site-header__mega-heading">
                  {activeItem.label}
                </h2>
                <ul className="site-header__mega-list">
                  {activeSubs.map((child) =>
                    isRealHref(child.uri) ? (
                      <li key={child.id}>
                        <Link
                          href={child.uri}
                          className="site-header__mega-text-link site-header__mega-type"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ) : (
                      <li key={child.id}>
                        <span className="site-header__mega-text-link site-header__mega-type">
                          {child.label}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </>
            )}
          </div>
        </nav>
      </div>
    );
  }
);

export default ShopMegaMenu;
