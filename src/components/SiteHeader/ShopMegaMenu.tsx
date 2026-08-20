import Image from 'next/image';
import Link from 'next/link';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { NavMenuItem, isRealHref } from '@/graphql/queries/menus';
import { ProductIcon, getProductIcon, scaleIcon } from '@/lib/productIcons';

interface ShopMegaMenuProps {
  id: string;
  labelledBy: string;
  shouldFocus: boolean;
  productItems: NavMenuItem[];
  navItems: NavMenuItem[];
}

const HEADING_IDS = {
  product: 'shop-mega-heading-product',
  mood: 'shop-mega-heading-mood',
  cannabinoids: 'shop-mega-heading-cannabinoids',
  featured: 'shop-mega-heading-featured',
  sub: 'shop-mega-heading-sub',
};

const ICON_HEIGHT = 36;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// WordPress serves these without a trailing slash today, but the permalink
// setting can add one, and then both the icon lookup and the PRIMARY match
// below would silently miss on every item at once.
const normalizeUri = (uri: string) => uri.replace(/\/+$/, '');

const slugFromUri = (uri: string) => normalizeUri(uri).split('/').pop() ?? '';

const ShopMegaMenu = forwardRef<HTMLDivElement, ShopMegaMenuProps>(
  function ShopMegaMenu({ id, labelledBy, shouldFocus, productItems, navItems }, ref) {
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
    const illustrated: { item: NavMenuItem; icon: ProductIcon }[] = [];
    const plain: NavMenuItem[] = [];

    for (const item of productItems) {
      if (!isRealHref(item.uri)) continue;
      const icon = getProductIcon(slugFromUri(item.uri));
      if (icon) illustrated.push({ item, icon });
      else plain.push(item);
    }

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

    const productLink = (item: NavMenuItem, icon?: ProductIcon) => {
      const size = icon ? scaleIcon(icon, ICON_HEIGHT) : null;
      return (
        <li key={item.id}>
          <Link
            href={item.uri}
            className={`site-header__mega-link${icon ? '' : ' site-header__mega-link--plain'}`}
            aria-current={
              normalizeUri(item.uri) === currentUri ? 'true' : undefined
            }
            onMouseEnter={() => activate(item.uri)}
            onFocus={() => activate(item.uri)}
          >
            {icon && size && (
              <Image
                className="site-header__mega-icon"
                src={icon.src}
                alt=""
                width={size.width}
                height={size.height}
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
                {illustrated.map(({ item, icon }) => productLink(item, icon))}
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
          </div>

          <div className="site-header__mega-col">
            <h2 id={HEADING_IDS.cannabinoids} className="site-header__mega-heading">
              Cannabinoids
            </h2>
          </div>

          <div className="site-header__mega-col">
            <h2 id={HEADING_IDS.featured} className="site-header__mega-heading">
              Featured
            </h2>
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
                          className="site-header__mega-sub-link"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ) : (
                      <li key={child.id}>
                        <span className="site-header__mega-sub-link">
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
