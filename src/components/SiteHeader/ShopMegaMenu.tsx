import Image from 'next/image';
import Link from 'next/link';
import { forwardRef, useEffect, useRef } from 'react';
import { NavMenuItem, isRealHref } from '@/graphql/queries/menus';
import { ProductIcon, getProductIcon, scaleIcon } from '@/lib/productIcons';

interface ShopMegaMenuProps {
  id: string;
  labelledBy: string;
  shouldFocus: boolean;
  productItems: NavMenuItem[];
}

const HEADING_IDS = {
  product: 'shop-mega-heading-product',
  mood: 'shop-mega-heading-mood',
  cannabinoids: 'shop-mega-heading-cannabinoids',
  featured: 'shop-mega-heading-featured',
};

const ICON_HEIGHT = 36;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// WordPress serves these without a trailing slash today, but the permalink
// setting can add one, and then a bare split().pop() returns '' and every icon
// silently disappears.
const slugFromUri = (uri: string) => uri.replace(/\/+$/, '').split('/').pop() ?? '';

const ShopMegaMenu = forwardRef<HTMLDivElement, ShopMegaMenuProps>(
  function ShopMegaMenu({ id, labelledBy, shouldFocus, productItems }, ref) {
    const navRef = useRef<HTMLElement>(null);

    useEffect(() => {
      if (!shouldFocus) return;
      // The fallback is what a keyboard open lands on when the menu query
      // returns nothing. Without it focus moves nowhere at all.
      const first = navRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? navRef.current)?.focus();
    }, [shouldFocus]);

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

    return (
      <div id={id} ref={ref} className="site-header__mega">
        <nav
          ref={navRef}
          className="site-header__mega-inner"
          aria-labelledby={labelledBy}
          tabIndex={-1}
        >
          <div className="site-header__mega-col">
            <h2 id={HEADING_IDS.product} className="site-header__mega-heading">
              Shop by Product
            </h2>

            {illustrated.length > 0 && (
              <ul className="site-header__mega-list">
                {illustrated.map(({ item, icon }) => {
                  const { width, height } = scaleIcon(icon, ICON_HEIGHT);
                  return (
                    <li key={item.id}>
                      <Link href={item.uri} className="site-header__mega-link">
                        <Image
                          className="site-header__mega-icon"
                          src={icon.src}
                          alt=""
                          width={width}
                          height={height}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {illustrated.length > 0 && plain.length > 0 && (
              <span className="site-header__mega-divider" aria-hidden="true" />
            )}

            {plain.length > 0 && (
              <ul className="site-header__mega-list">
                {plain.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.uri}
                      className="site-header__mega-link site-header__mega-link--plain"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
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
        </nav>
      </div>
    );
  }
);

export default ShopMegaMenu;
