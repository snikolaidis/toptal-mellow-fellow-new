import { getClient, getBrowserClient } from '@/lib/apollo-client';
import Link from 'next/link';
import { useState } from 'react';
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

const GET_NAV = gql`
  query {
    menuItems(where: { location: PRIMARY }) {
      nodes {
        id
        label
        uri
        parentId
        connectedNode {
          node {
            __typename
            uri
          }
        }
        childItems {
          nodes {
            id
            label
            uri
            connectedNode {
              node {
                __typename
                uri
              }
            }
          }
        }
      }
    }
  }
`;

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
  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data } = useQuery(GET_NAV, { client });

  const { cart } = useCart();
  const { isAuthenticated, isReady } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const menuItems: MenuItem[] = data?.menuItems?.nodes ?? [];
  const topLevelItems = menuItems.filter((item: MenuItem) => !item.parentId);

  const getMenuItemUri = (item: MenuItem): string => {
    const typename = item.connectedNode?.node?.__typename;
    const uri = item.uri ?? '/';

    console.log(item);

    if (typename === 'ProductCategory') {
      return uri.replace('/product-category/', '/collections/');
    }

    return uri;
  };

  return (
    <>
      <nav className="navbar is-primary" role="navigation" aria-label="main navigation">
        <div className="container">
          <div className="navbar-brand">
            <h1>
              <span className="is-sr-only">
                Mellow Fellow
              </span>
              <a className="navbar-item" href="/">
                <MellowFellowLogo />
              </a>
            </h1>
          </div>

          <div className="navbar-end">
            <div className={styles.iconGroup}>
              {/* Search Button */}
              <button
                className={styles.iconBtn}
                onClick={() => setSearchModalOpen(true)}
                aria-label="Search"
              >
                <SearchIcon />
              </button>

              {/* Account */}
              {isReady && (
                <Link
                  href={isAuthenticated ? '/account' : '/login'}
                  className={styles.iconBtn}
                  aria-label="Account"
                >
                  <UserIcon />
                </Link>
              )}

              {/* Cart */}
              <Link
                href="/cart"
                className={`${styles.iconBtn} ${styles.cartBtn}`}
                aria-label="Cart"
              >
                <CartIcon />
                {cart && cart.itemsCount > 0 && (
                  <span className={styles.cartBadge}>
                    {cart.itemsCount}
                  </span>
                )}
              </Link>
            </div>

            <a role="button"
              className={`navbar-burger ${isOpen ? 'is-active' : ''}`}
              aria-label="menu"
              aria-expanded={isOpen}
              onClick={() => setIsOpen(!isOpen)}
            >
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </a>
          </div>

          <div className={`navbar-menu ${isOpen ? 'is-active' : ''}`}>
            {topLevelItems.map((item: MenuItem) => {
              const children = item.childItems?.nodes ?? [];

              if (children.length > 0) {
                return (
                  <div key={item.id} className="navbar-item has-dropdown is-hoverable">
                    <Link className="navbar-link" href={getMenuItemUri(item)}>
                      {item.label}
                    </Link>
                    <div className="navbar-dropdown">
                      {children.map((child: MenuItem) => (
                        <Link key={child.id} className="navbar-item" href={getMenuItemUri(child)}>
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <Link key={item.id} className="navbar-item" href={getMenuItemUri(item)}>
                  {item.label}
                </Link>
              );
            })}
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