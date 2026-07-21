import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@faustwp/core';
import {
  MellowFellowLogo,
  SearchIcon,
  UserIcon,
  CartIcon
} from '@/components/icons';
import SearchModal from '@/components/SearchModal';
import styles from './NavBar.module.css';
import { gql, useQuery } from '@apollo/client';

export const GET_NAV = gql`
  query {
    menuItems(where: { location: PRIMARY, parentId: 0 }, first: 100) {
      nodes {
        id
        label
        uri
        childItems {
          nodes {
            id
            label
            uri
          }
        }
      }
    }
  }
`;

const isRealHref = (uri?: string | null) => !!uri && uri !== '#';

const ChevronIcon = () => (
  <span className="nav-caret" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

interface MenuItem {
  id: string;
  label: string;
  uri: string;
  parentId: string | null;
  connectedNode?: {
    node?: {
      __typename?: string;
      uri?: string;
    };
  };
  childItems?: {
    nodes: MenuItem[];
  };
}

export default function Navbar() {
  const { data } = useQuery(GET_NAV);

  const { cart, toggleDrawer } = useCart();
  const { isAuthenticated, isReady } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 0);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const menuItems: MenuItem[] = data?.menuItems?.nodes ?? [];

  const closeMenu = () => {
    setIsOpen(false);
    setOpenMenus(new Set());
  };

  const toggleSubmenu = (id: string) => {
    setOpenMenus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isTouch = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

  const handleParentClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (isTouch()) {
      e.preventDefault();
      toggleSubmenu(id);
    } else {
      closeMenu();
    }
  };

  return (
    <>
      <nav className={`navbar is-primary ${isScrolled ? 'is-scrolled' : ''}`} role="navigation" aria-label="main navigation">
        <div className="container">
          <div className="navbar-start">
            <a role="button"
              id="mobile-nav-toggle"
              className={`navbar-burger ${isOpen ? 'is-active' : ''}`}
              aria-label="menu"
              aria-expanded={isOpen}
              onClick={() => (isOpen ? closeMenu() : setIsOpen(true))}
            >
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </a>
          </div>
          <div className="navbar-brand">
            <h1>
              <span className="is-sr-only">
                Mellow Fellow
              </span>
              <Link id="nav-logo-link" className="" href="/" onClick={closeMenu}>
                <MellowFellowLogo />
              </Link>
            </h1>
          </div>

          <div className="navbar-end">
            <div className="navbar-controls">
              {/* Search Button */}
              <button
                className="is-flex"
                onClick={() => setSearchModalOpen(true)}
                aria-label="Search"
              >
                <SearchIcon />
              </button>

              {/* Account */}
              {isReady && (
                <Link
                  href={isAuthenticated ? '/account' : '/login'}
                  className={`is-flex ${styles.navIconLink}`}
                  aria-label="Account"
                >
                  <UserIcon />
                  <span className={styles.navIconLabel}>Account</span>
                </Link>
              )}

              {/* Cart */}
              <button
                type="button"
                className={`is-flex ${styles.navIconLink}`}
                aria-label="Toggle cart"
                onClick={toggleDrawer}
              >
                <span className={styles.cartBtn}>
                  <CartIcon />
                  {cart && cart.itemsCount > 0 && (
                    <span className={styles.cartBadge}>
                      {cart.itemsCount}
                    </span>
                  )}
                </span>
                <span className={styles.navIconLabel}>Cart</span>
              </button>
            </div>
          </div>

          <div className={`navbar-menu ${isOpen ? 'is-active' : ''}`}>
            <div className="navbar-menu-inner">
            {menuItems.map((item: MenuItem) => {
              const children = item.childItems?.nodes ?? [];

              if (children.length > 0) {
                const submenuOpen = openMenus.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`navbar-item has-dropdown is-hoverable ${submenuOpen ? 'is-open' : ''}`}
                  >
                    {isRealHref(item.uri) ? (
                      <Link
                        id={`nav-item-${item.id}`}
                        className="navbar-link"
                        href={item.uri}
                        aria-expanded={submenuOpen}
                        onClick={(e) => handleParentClick(e, item.id)}
                      >
                        {item.label}
                        <ChevronIcon />
                      </Link>
                    ) : (
                      <span
                        id={`nav-item-${item.id}`}
                        className="navbar-link"
                        role="button"
                        aria-expanded={submenuOpen}
                        onClick={() => toggleSubmenu(item.id)}
                      >
                        {item.label}
                        <ChevronIcon />
                      </span>
                    )}
                    <div className="navbar-dropdown">
                      {children.map((child: MenuItem) =>
                        isRealHref(child.uri) ? (
                          <Link
                            key={child.id}
                            id={`nav-item-${child.id}`}
                            className="navbar-item"
                            href={child.uri}
                            onClick={closeMenu}
                          >
                            {child.label}
                          </Link>
                        ) : (
                          <span key={child.id} id={`nav-item-${child.id}`} className="navbar-item">
                            {child.label}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              }

              if (!isRealHref(item.uri)) {
                return (
                  <span key={item.id} id={`nav-item-${item.id}`} className="navbar-item">
                    {item.label}
                  </span>
                );
              }

              return (
                <Link
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  className="navbar-item"
                  href={item.uri}
                  onClick={closeMenu}
                >
                  {item.label}
                </Link>
              );
            })}
            </div>
          </div>
        </div>
      </nav>

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </>
  );
}