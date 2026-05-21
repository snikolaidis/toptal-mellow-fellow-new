import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@faustwp/core';
import {
  TwentyOneLogo,
  SearchIcon,
  UserIcon,
  CartIcon,
  MenuIcon,
  CloseIcon,
} from '@/components/icons';
import SearchModal from '@/components/SearchModal';
import styles from './Header.module.css';

export default function Header() {
  const { cart } = useCart();
  const { isAuthenticated, isReady } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {/* Mobile menu button */}
          <button
            className={styles.mobileMenuButton}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>

          {/* Logo */}
          <Link href="/" className={styles.logo}>
            <TwentyOneLogo className="h-8 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <nav className={styles.desktopNav}>
            <Link href="/shop" className={styles.navLink}>
              Shop
            </Link>
            <Link href="/shop?category=flower" className={styles.navLink}>
              Flower
            </Link>
            <Link href="/shop?category=edibles" className={styles.navLink}>
              Edibles
            </Link>
            <Link href="/shop?category=concentrates" className={styles.navLink}>
              Concentrates
            </Link>
            <Link href="/shop?category=accessories" className={styles.navLink}>
              Accessories
            </Link>
          </nav>
        </div>

        <div className={styles.headerRight}>
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
      </header>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className={styles.mobileNav}>
          <nav className={styles.mobileNavLinks}>
            <Link
              href="/shop"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Shop All
            </Link>
            <Link
              href="/shop?category=flower"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Flower
            </Link>
            <Link
              href="/shop?category=edibles"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Edibles
            </Link>
            <Link
              href="/shop?category=concentrates"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Concentrates
            </Link>
            <Link
              href="/shop?category=accessories"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Accessories
            </Link>
            <hr className={styles.mobileDivider} />
            {isReady && (
              isAuthenticated ? (
                <Link
                  href="/account"
                  className={styles.mobileNavLink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  My Account
                </Link>
              ) : (
                <Link
                  href="/login"
                  className={styles.mobileNavLink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
              )
            )}
          </nav>
        </div>
      )}

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </>
  );
}
