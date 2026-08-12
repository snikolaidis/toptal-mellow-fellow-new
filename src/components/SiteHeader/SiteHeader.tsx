import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { MellowFellowLogo, UserIcon, CartIcon } from '@/components/icons';
import SearchModal from '@/components/SearchModal';
import { GET_NAV, NavMenuItem } from '@/graphql/queries/menus';
import AnnouncementBar from './AnnouncementBar';
import SearchTrigger from './SearchTrigger';
import PrimaryNav from './PrimaryNav';
import MenuDrawer from './MenuDrawer';

export default function SiteHeader() {
  const { data } = useQuery(GET_NAV);
  const { cart, cartReady, toggleDrawer } = useCart();
  const { isAuthenticated, isReady } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const expandedHeight = useRef(0);

  const menuItems: NavMenuItem[] = data?.menuItems?.nodes ?? [];

  useEffect(() => {
    setHydrated(true);
  }, []);

  // The collapse animates, so reading the height as soon as the class comes off
  // captures a mid-transition value and the collapse point moves every cycle.
  // Wait until two consecutive frames agree, which means the transition is done.
  useEffect(() => {
    if (isScrolled) return;
    const el = headerRef.current;
    if (!el) return;

    let raf = 0;
    let previous = -1;
    const settle = () => {
      const height = el.offsetHeight;
      if (height === previous) {
        expandedHeight.current = height;
        return;
      }
      previous = height;
      raf = requestAnimationFrame(settle);
    };
    const restart = () => {
      cancelAnimationFrame(raf);
      previous = -1;
      raf = requestAnimationFrame(settle);
    };

    restart();
    window.addEventListener('resize', restart);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', restart);
    };
  }, [isScrolled]);

  // Collapsing shortens the document by the height delta, and scroll anchoring
  // answers by pulling scrollY down by that same amount. Trigger and result are
  // therefore coupled: any re-expand threshold within the delta of the collapse
  // threshold oscillates forever. Re-expanding only at the very top is the one
  // safe choice, because it is both the widest possible gap and the one offset
  // where the browser suppresses anchoring, so expanding cannot push us back
  // down across the collapse threshold.
  useEffect(() => {
    const onScroll = () => {
      setIsScrolled((prev) =>
        prev ? window.scrollY > 0 : window.scrollY > expandedHeight.current
      );
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = () => {
    setIsOpen(false);
    setOpenMenus(new Set());
  };

  // 1024px is Bulma's desktop breakpoint. Without this the drawer stays open
  // across the boundary and the burger that would close it is hidden.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsOpen(false);
        setOpenMenus(new Set());
      }
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const toggleSubmenu = (id: string) => {
    setOpenMenus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // CartContext seeds its state from localStorage in a lazy useState initialiser,
  // so a returning visitor has a full cart on the very first client render while
  // the server had none. Both values stay empty until after mount so the first
  // client render matches the server. Without this the mismatch only appears for
  // visitors who already have items, never for a developer with an empty cart.
  const itemsCount = hydrated ? cart?.itemsCount ?? 0 : 0;
  const cartSubtotal = hydrated && cartReady ? cart?.subtotal ?? '' : '';

  return (
    <>
      <header ref={headerRef} className={`site-header ${isScrolled ? 'is-scrolled' : ''}`}>
        <AnnouncementBar />

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
                <span className="site-header__account-line">Sign In</span>
                <span className="site-header__account-line">Account</span>
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
              id="mobile-nav-toggle"
              className={`navbar-burger site-header__burger ${isOpen ? 'is-active' : ''}`}
              aria-label="menu"
              aria-expanded={isOpen}
              aria-controls="site-header-drawer"
              onClick={() => (isOpen ? closeMenu() : setIsOpen(true))}
            >
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </button>
          </div>
        </div>

        <PrimaryNav items={menuItems} />

        <MenuDrawer
          items={menuItems}
          isOpen={isOpen}
          openMenus={openMenus}
          onToggleSubmenu={toggleSubmenu}
          onNavigate={closeMenu}
        />
      </header>

      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </>
  );
}
