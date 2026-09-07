import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { MellowFellowLogo, UserIcon, CartIcon } from '@/components/icons';
import {
  GET_NAV,
  GET_SHOP_MEGA_MENU,
  GET_MEGA_MENU_FEATURED,
  MegaMenuFeaturedLink,
  NavMenuItem,
  PromotionalSlide,
} from '@/graphql/queries/menus';
import { GET_ALL_MOODS } from '@/graphql/queries/moods';
import { MoodPill } from '@/types/mood';
import AnnouncementBar from './AnnouncementBar';
import SearchTrigger from './SearchTrigger';
import PrimaryNav from './PrimaryNav';
import MobileMegaMenu from './MobileMegaMenu';
import ShopMegaMenu from './ShopMegaMenu';
import { useShopMegaMenu } from './useShopMegaMenu';
import { buildMegaMenuModel } from './megaMenuModel';

const SearchModal = dynamic(() => import('@/components/SearchModal'), {
  ssr: false,
});

const CONDENSE_AT = 150;
const DIRECTION_DELTA = 8;
const MEGA_MENU_ID = 'shop-mega-menu';
const MOBILE_MENU_ID = 'site-header-mobile-menu';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function SiteHeader() {
  const { data } = useQuery(GET_NAV);
  // Read here rather than inside the panel. The panel mounts on open, so a query
  // living there would start only once the user has already clicked.
  const { data: megaData } = useQuery(GET_SHOP_MEGA_MENU);
  const { data: moodData } = useQuery(GET_ALL_MOODS);
  const { data: featuredData } = useQuery(GET_MEGA_MENU_FEATURED);
  const { cart, cartReady, cartItemCount, toggleDrawer } = useCart();
  const { isAuthenticated, isReady } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [isCondensed, setIsCondensed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const menuItems: NavMenuItem[] = data?.menuItems?.nodes ?? [];
  const megaMenuItems: NavMenuItem[] = megaData?.menuItems?.nodes ?? [];
  const megaMoods: MoodPill[] = moodData?.moods?.nodes ?? [];
  const megaFeatured: MegaMenuFeaturedLink[] =
    featuredData?.siteSettings?.megaMenuFeatured?.links ?? [];
  const megaSlides: PromotionalSlide[] =
    featuredData?.siteSettings?.promotionalSlides?.slides ?? [];

  const megaMenuModel = useMemo(
    () =>
      buildMegaMenuModel({
        productItems: megaMenuItems,
        navItems: menuItems,
        moods: megaMoods,
        featuredLinks: megaFeatured,
        promotionalSlides: megaSlides,
      }),
    [megaMenuItems, menuItems, megaMoods, megaFeatured, megaSlides]
  );

  const {
    isOpen: megaMenuOpen,
    shouldFocusPanel,
    triggerRef: megaMenuTriggerRef,
    panelRef: megaMenuPanelRef,
    toggle: toggleMegaMenu,
    close: closeMegaMenu,
  } = useShopMegaMenu({ isCondensed });

  const burgerRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const condensedRef = useRef(false);
  const lastYRef = useRef(0);
  const lastHeightRef = useRef(0);
  const goingDownRef = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Condensing takes the two rows out of flow and scroll anchoring answers by
  // moving scrollY by their height. Re-reading it after layout and before paint
  // keeps that jump out of the next delta.
  useIsomorphicLayoutEffect(() => {
    lastYRef.current = Math.max(0, window.scrollY);
    lastHeightRef.current = headerRef.current?.offsetHeight ?? 0;
  }, [isCondensed]);

  useEffect(() => {
    let raf = 0;
    const evaluate = () => {
      raf = 0;
      const y = Math.max(0, window.scrollY);
      const height = headerRef.current?.offsetHeight ?? 0;

      // Any other change of header height moves scrollY the same way, and a
      // ResizeObserver cannot catch it: the frame runs scroll callbacks before
      // it broadcasts resizes, so the observer is always a frame late. Opening
      // the drawer moves scrollY 409px, read as a scroll up when it closes.
      if (height !== lastHeightRef.current) {
        lastHeightRef.current = height;
        lastYRef.current = y;
        return;
      }

      const delta = y - lastYRef.current;

      if (Math.abs(delta) >= DIRECTION_DELTA) {
        lastYRef.current = y;
        goingDownRef.current = delta > 0;
      }

      // Condensing drops scrollY below the arming threshold, so re-testing it
      // would un-condense on the very next sample and start the loop again.
      const next =
        goingDownRef.current &&
        (condensedRef.current ? y > 0 : y > CONDENSE_AT);

      if (next !== condensedRef.current) {
        condensedRef.current = next;
        setIsCondensed(next);
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(evaluate);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const closeMenu = () => setIsOpen(false);

  // 1024px is Bulma's desktop breakpoint. Without this the drawer stays open
  // across the boundary and the burger that would close it is hidden.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnBreakpoint = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsOpen(false);
      } else {
        closeMegaMenu();
      }
    };
    desktop.addEventListener('change', closeOnBreakpoint);
    return () => desktop.removeEventListener('change', closeOnBreakpoint);
  }, [closeMegaMenu]);

  // CartContext seeds its state from localStorage in a lazy useState initialiser,
  // so a returning visitor has a full cart on the very first client render while
  // the server had none. Both values stay empty until after mount so the first
  // client render matches the server. Without this the mismatch only appears for
  // visitors who already have items, never for a developer with an empty cart.
  const itemsCount = hydrated ? cart?.itemsCount ?? 0 : 0;
  // Show the net merchandise total (after all discounts) — what the customer
  // will actually pay for the items — matching the drawer/checkout "Total".
  const cartSubtotal =
    hydrated && cartReady && cart?.items?.length
      ? `$${cart.items
          .reduce((s, i) => s + (parseFloat((i.total || '').replace(/[^0-9.-]/g, '')) || 0), 0)
          .toFixed(2)}`
      : '';

  return (
    <>
      <header
        ref={headerRef}
        className={`site-header${isCondensed ? ' is-condensed' : ''}`}
      >
        <AnnouncementBar isVisible={!isCondensed} />

        <div className="site-header__bar">
          <div className="site-header__logo">
            <h1>
              <span className="is-sr-only">Mellow Fellow</span>
              <Link id="nav-logo-link" href="/" onClick={closeMenu}>
                <MellowFellowLogo />
              </Link>
            </h1>
          </div>

          <div className="site-header__search-cell">
            <SearchTrigger onOpen={() => setSearchModalOpen(true)} />
          </div>

          <div className="site-header__actions">
            <Link
              href={isReady && isAuthenticated ? '/account' : '/login'}
              className="site-header__action site-header__account"
            >
              <span className="site-header__action-icon">
                <UserIcon />
              </span>
              <span className="site-header__account-text">
                {!isReady ? (
                  <>
                    <span className="site-header__account-line">&nbsp;</span>
                    <span className="site-header__account-line">Account</span>
                  </>
                ) : isAuthenticated ? (
                  <>
                    <span className="site-header__account-line">My</span>
                    <span className="site-header__account-line">Account</span>
                  </>
                ) : (
                  <>
                    <span className="site-header__account-line">Sign In</span>
                    <span className="site-header__account-line">Account</span>
                  </>
                )}
              </span>
            </Link>

            <button
              type="button"
              className="site-header__action site-header__cart"
              aria-label="Toggle cart"
              onClick={toggleDrawer}
            >
              <span className="site-header__cart-icon">
                <CartIcon />
                <span className="site-header__cart-badge">{itemsCount}</span>
              </span>
              <span className="site-header__cart-subtotal">{cartSubtotal}</span>
            </button>

            <button
              type="button"
              ref={burgerRef}
              id="mobile-nav-toggle"
              className={`navbar-burger site-header__burger ${isOpen ? 'is-active' : ''}`}
              aria-label="menu"
              aria-expanded={isOpen}
              aria-controls={MOBILE_MENU_ID}
              onClick={() => (isOpen ? closeMenu() : setIsOpen(true))}
            >
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </button>
          </div>
        </div>

        <PrimaryNav
          items={menuItems}
          megaMenuOpen={megaMenuOpen}
          megaMenuId={MEGA_MENU_ID}
          megaMenuTriggerRef={megaMenuTriggerRef}
          onMegaMenuToggle={toggleMegaMenu}
          onSiblingActivate={closeMegaMenu}
          megaMenuPanel={
            megaMenuOpen ? (
              <ShopMegaMenu
                id={MEGA_MENU_ID}
                ref={megaMenuPanelRef}
                labelledBy="nav-shop"
                shouldFocus={shouldFocusPanel}
                model={megaMenuModel}
              />
            ) : null
          }
        />

        <MobileMegaMenu
          id={MOBILE_MENU_ID}
          isOpen={isOpen}
          onClose={closeMenu}
          triggerRef={burgerRef}
          model={megaMenuModel}
        />
      </header>

      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </>
  );
}
