import Image from 'next/image';
import Link from 'next/link';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { NavMenuItem, isRealHref } from '@/graphql/queries/menus';
import { ProductIcon, scaleIcon } from '@/lib/productIcons';
import { decodeEntities } from '@/lib/decodeEntities';
import { MegaMenuModel, MegaMenuProduct } from './megaMenuModel';

interface ShopMegaMenuProps {
  id: string;
  labelledBy: string;
  shouldFocus: boolean;
  model: MegaMenuModel;
}

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

const ShopMegaMenu = forwardRef<HTMLDivElement, ShopMegaMenuProps>(
  function ShopMegaMenu({ id, labelledBy, shouldFocus, model }, ref) {
    const { products, illustrated, plain, moods, cannabinoids, featured } = model;
    const navRef = useRef<HTMLElement>(null);

    useEffect(() => {
      if (!shouldFocus) return;
      // The fallback is what a keyboard open lands on when the menu query
      // returns nothing. Without it focus moves nowhere at all.
      const first = navRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? navRef.current)?.focus();
    }, [shouldFocus]);

    const [activeUri, setActiveUri] = useState<string | null>(null);

    // Resolving the default at render rather than seeding state in an effect
    // keeps the panel populated on its very first paint, before any hover.
    const currentUri =
      activeUri ?? products.find((p) => p.hasChildren)?.key ?? null;
    const active = products.find((p) => p.key === currentUri);

    // Items with no sub items leave the panel showing whatever was there, so it
    // is never empty.
    const activate = (product: MegaMenuProduct) => {
      if (product.hasChildren) setActiveUri(product.key);
    };

    const productLink = (product: MegaMenuProduct) => {
      const { item, icon, slug } = product;
      const box = icon
        ? ICON_BOX[slug] ?? scaleIcon(icon, ICON_FALLBACK_HEIGHT)
        : null;
      const className = [
        'site-header__mega-link',
        icon ? '' : 'site-header__mega-link--plain',
        slug === UNTYPED_SLUG ? '' : 'site-header__mega-type',
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <li key={item.id}>
          <Link
            href={item.uri}
            className={className}
            aria-current={product.key === currentUri ? 'true' : undefined}
            onMouseEnter={() => activate(product)}
            onFocus={() => activate(product)}
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
                {illustrated.map(productLink)}
              </ul>
            )}

            {illustrated.length > 0 && plain.length > 0 && (
              <span className="site-header__mega-divider" aria-hidden="true" />
            )}

            {plain.length > 0 && (
              <ul className="site-header__mega-list">
                {plain.map(productLink)}
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
              {cannabinoids.map((item) => (
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
            {active && (
              <>
                <h2 id={HEADING_IDS.sub} className="site-header__mega-heading">
                  {active.item.label}
                </h2>
                <ul className="site-header__mega-list">
                  {active.children.map((child) =>
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
