import Link from 'next/link';
import { useEffect, useState } from 'react';
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

  const menuItems: NavMenuItem[] = data?.menuItems?.nodes ?? [];

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

  const itemsCount = cart?.itemsCount ?? 0;

  return (
    <>
      <header className="site-header">
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
                {itemsCount > 0 && (
                  <span className="site-header__cart-badge">{itemsCount}</span>
                )}
              </span>
              {/* The cart loads client side, so this gate prevents a hydration mismatch and a $0.00 flash. */}
              <span className="site-header__cart-subtotal">
                {cartReady ? cart?.subtotal : ''}
              </span>
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
