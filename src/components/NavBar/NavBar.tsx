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

export default function Navbar() {
  const { cart } = useCart();
  const { isAuthenticated, isReady } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  return (
    <>
      <nav className="navbar is-primary" role="navigation" aria-label="main navigation">
        <div className="container">
          <div className={`navbar-menu ${isOpen ? 'is-active' : ''}`}>
            <div className="navbar-start">
              <a className="navbar-item" href="/shop">Shop</a>
              <a className="navbar-item" href="/cart">Cart</a>
            </div>
          </div>
          
          <div className="navbar-brand">
            <h1>
              <span className="is-sr-only">
                Mellow Fellow
              </span>
              <a className="navbar-item" href="/">
                <MellowFellowLogo />
              </a>
            </h1>
            
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

          <div className="navbar-menu">
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